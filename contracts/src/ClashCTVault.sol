// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @dev CT tokens that expose a native burn(). If the token doesn't, the vault
///      sweeps the burn share to `BURN_SINK` instead (configured at deploy).
interface IBurnableERC20 {
    function burn(uint256 amount) external;
}

/**
 * @title ClashCTVault
 * @notice The on-chain coin-slot + ticket-dispenser for Clash Front's CT economy
 *         (docs: ECONOMY-MASTER-SUMMARY §0b, docs/briefs/CT-VAULT-AND-KEEPER.md).
 *
 *         Server-authoritative model: the backend holds the ONLY authoritative
 *         balances (gold, resources, spendable CT). This contract is the on-chain
 *         MIRROR and the money boundary. Two flows cross it:
 *
 *         DEPOSIT  — a player sends CT in. `deposited[user]` rises; a `Deposit`
 *                    event fires; the off-chain KEEPER credits the backend ledger
 *                    (idempotent by `depositId`). CT enters the game ONLY here.
 *
 *         WITHDRAW — a player redeems CT out, authorized by a backend-signed
 *                    EIP-712 voucher carrying a CUMULATIVE authorized total. The
 *                    contract pays the delta and enforces the HARD invariant:
 *
 *                        withdrawn[user]  <=  deposited[user]           (W <= D)
 *
 *                    So even a fully-compromised backend signer can never make a
 *                    user withdraw more than they deposited. The game is
 *                    structurally negative-sum for CT — the anti-cheat is the math.
 *
 *         HOUSE CUT — CT that gameplay consumed (never withdrawn) is the house's.
 *                    A backend-signed sweep moves it out with a HARD floor:
 *                    at least `MIN_BURN_BPS` (>=10%) of every sweep is BURNED
 *                    (the net-sink), the rest goes to the developer vault
 *                    (the discretionary prize pool). A `minReserveAfter` guard
 *                    keeps enough CT in the contract to honour outstanding
 *                    user withdrawals.
 *
 * @dev SECURITY: unaudited. MUST be audited before mainnet. Immutable core +
 *      Pausable guardian + Ownable2Step admin (put a timelock/multisig on owner).
 *      Signer/operator/guardian keys are the trust boundary — see the brief.
 */
contract ClashCTVault is EIP712, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Immutable config ──────────────────────────────────────────────────────
    IERC20 public immutable CT;            // the CT token (Pentagon Chain ERC-20)
    bool public immutable BURN_SUPPORTED;  // token exposes burn()?
    address public immutable BURN_SINK;    // fallback burn address if not (e.g. 0x…dEaD)
    uint16 public constant MIN_BURN_BPS = 1000;   // >=10% of every sweep burns (hard floor)
    uint16 public constant MAX_CUT_BPS = 4000;    // sanity: a single sweep can't exceed 40% cut semantics

    // ── Roles ─────────────────────────────────────────────────────────────────
    address public withdrawalSigner; // backend key that signs withdrawal + sweep vouchers
    address public devVault;         // receives the non-burned house cut
    address public guardian;         // may pause (fast), cannot move funds

    // ── Per-user accounting (the on-chain source of truth for W <= D) ─────────
    mapping(address => uint256) public deposited; // cumulative CT deposited (monotonic)
    mapping(address => uint256) public withdrawn;  // cumulative CT withdrawn  (monotonic)
    uint256 public depositNonce;                   // monotonic id for Deposit events
    mapping(bytes32 => bool) public usedSweepNonce;

    // ── Aggregates (telemetry / sweep guard) ──────────────────────────────────
    uint256 public totalDeposited;
    uint256 public totalWithdrawn;
    uint256 public totalBurned;
    uint256 public totalToVault;

    // ── EIP-712 typehashes ────────────────────────────────────────────────────
    // Withdraw: the backend authorises a CUMULATIVE total for `user`.
    bytes32 private constant WITHDRAW_TYPEHASH =
        keccak256("Withdraw(address user,uint256 authorizedCumulative,uint256 deadline)");
    // Sweep: the backend authorises moving `burnAmount`+`vaultAmount` of house cut,
    // attesting that `minReserveAfter` CT must remain for outstanding user claims.
    bytes32 private constant SWEEP_TYPEHASH =
        keccak256("Sweep(uint256 burnAmount,uint256 vaultAmount,uint256 minReserveAfter,bytes32 nonce,uint256 deadline)");

    // ── Events (the keeper consumes these) ────────────────────────────────────
    event Deposit(address indexed user, uint256 amount, uint256 indexed depositId);
    event Withdraw(address indexed user, uint256 amount, uint256 authorizedCumulative);
    event HouseSwept(uint256 burnAmount, uint256 vaultAmount);
    event SignerChanged(address indexed signer);
    event DevVaultChanged(address indexed devVault);
    event GuardianChanged(address indexed guardian);

    error ZeroAmount();
    error ExceedsDeposited();     // the W <= D backstop tripped
    error StaleVoucher();
    error BadSignature();
    error NonceUsed();
    error BurnFloor();            // sweep burn share below MIN_BURN_BPS
    error ReserveBreach();        // sweep would leave too little for user claims
    error NotGuardian();

    constructor(
        address ct,
        bool burnSupported,
        address burnSink,
        address signer,
        address vault,
        address guardian_,
        address owner_
    ) EIP712("ClashCTVault", "1") Ownable(owner_) {
        require(ct != address(0) && signer != address(0) && vault != address(0), "zero addr");
        CT = IERC20(ct);
        BURN_SUPPORTED = burnSupported;
        BURN_SINK = burnSink == address(0) ? address(0x000000000000000000000000000000000000dEaD) : burnSink;
        withdrawalSigner = signer;
        devVault = vault;
        guardian = guardian_;
    }

    // ── DEPOSIT ────────────────────────────────────────────────────────────────

    /// @notice Deposit `amount` CT into the game. Requires prior `CT.approve(this, amount)`.
    ///         Emits `Deposit(msg.sender, amount, depositId)` — the keeper credits the backend.
    function deposit(uint256 amount) external whenNotPaused nonReentrant {
        _deposit(msg.sender, amount);
    }

    /// @notice Deposit on behalf of `to` (e.g. a mobile onramp crediting a player).
    function depositFor(address to, uint256 amount) external whenNotPaused nonReentrant {
        require(to != address(0), "zero to");
        _deposit(to, amount);
    }

    function _deposit(address user, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        // Measure the ACTUAL received amount (defends against fee-on-transfer tokens).
        uint256 before = CT.balanceOf(address(this));
        CT.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = CT.balanceOf(address(this)) - before;
        if (received == 0) revert ZeroAmount();
        deposited[user] += received;
        totalDeposited += received;
        uint256 id = ++depositNonce;
        emit Deposit(user, received, id);
    }

    // ── WITHDRAW (backend-authorised, W <= D enforced) ─────────────────────────

    /**
     * @notice Redeem CT out of the game against a backend-signed EIP-712 voucher.
     * @param authorizedCumulative The cumulative CT the backend authorises `msg.sender`
     *        to have withdrawn in total. The contract pays `authorizedCumulative - withdrawn`.
     *        Re-submitting a stale/lower voucher is a safe no-op (nothing to pay).
     */
    function withdraw(uint256 authorizedCumulative, uint256 deadline, bytes calldata signature)
        external
        whenNotPaused
        nonReentrant
    {
        if (block.timestamp > deadline) revert StaleVoucher();
        // HARD invariant — the anti-cheat backstop, independent of the signer.
        if (authorizedCumulative > deposited[msg.sender]) revert ExceedsDeposited();

        bytes32 structHash =
            keccak256(abi.encode(WITHDRAW_TYPEHASH, msg.sender, authorizedCumulative, deadline));
        _requireSigner(structHash, signature);

        uint256 already = withdrawn[msg.sender];
        if (authorizedCumulative <= already) revert ZeroAmount(); // nothing new to pay
        uint256 amount = authorizedCumulative - already;
        withdrawn[msg.sender] = authorizedCumulative;
        totalWithdrawn += amount;
        CT.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, amount, authorizedCumulative);
    }

    // ── HOUSE CUT SWEEP (>=10% burn floor, rest to dev vault) ──────────────────

    /**
     * @notice Move realised house cut out: burn `burnAmount`, send `vaultAmount`
     *         to the dev vault. Backend-signed (the signer attests, off-ledger,
     *         that this much is genuinely house-owned and that `minReserveAfter`
     *         covers outstanding user withdrawals).
     * @dev Enforces the >=10% burn floor on-chain and refuses to drop the balance
     *      below `minReserveAfter` (protects user claims from an over-sweep).
     */
    function sweepHouseCut(
        uint256 burnAmount,
        uint256 vaultAmount,
        uint256 minReserveAfter,
        bytes32 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        if (block.timestamp > deadline) revert StaleVoucher();
        if (usedSweepNonce[nonce]) revert NonceUsed();
        uint256 total = burnAmount + vaultAmount;
        if (total == 0) revert ZeroAmount();
        // >=10% of the sweep must burn (net-sink hard floor).
        if (uint256(burnAmount) * 10000 < total * MIN_BURN_BPS) revert BurnFloor();

        bytes32 structHash = keccak256(
            abi.encode(SWEEP_TYPEHASH, burnAmount, vaultAmount, minReserveAfter, nonce, deadline)
        );
        _requireSigner(structHash, signature);
        usedSweepNonce[nonce] = true;

        // Don't sweep into money owed to users.
        if (CT.balanceOf(address(this)) < total + minReserveAfter) revert ReserveBreach();

        totalBurned += burnAmount;
        totalToVault += vaultAmount;
        if (vaultAmount > 0) CT.safeTransfer(devVault, vaultAmount);
        if (burnAmount > 0) _burn(burnAmount);
        emit HouseSwept(burnAmount, vaultAmount);
    }

    function _burn(uint256 amount) internal {
        if (BURN_SUPPORTED) {
            IBurnableERC20(address(CT)).burn(amount);
        } else {
            CT.safeTransfer(BURN_SINK, amount);
        }
    }

    // ── Admin (owner = timelock/multisig; guardian = fast pause only) ──────────

    function setSigner(address s) external onlyOwner {
        require(s != address(0), "zero");
        withdrawalSigner = s;
        emit SignerChanged(s);
    }

    function setDevVault(address v) external onlyOwner {
        require(v != address(0), "zero");
        devVault = v;
        emit DevVaultChanged(v);
    }

    function setGuardian(address g) external onlyOwner {
        guardian = g;
        emit GuardianChanged(g);
    }

    /// @notice Guardian or owner may pause deposits/withdrawals instantly (incident response).
    function pause() external {
        if (msg.sender != guardian && msg.sender != owner()) revert NotGuardian();
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Rescue tokens accidentally sent here — NEVER the CT token (user funds).
    function rescueForeignToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(CT), "cannot touch CT");
        IERC20(token).safeTransfer(to, amount);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    /// @notice The on-chain ceiling a user could still withdraw (W <= D). The backend
    ///         signs the actual (smaller) figure reflecting their real game balance.
    function withdrawableCeiling(address user) external view returns (uint256) {
        uint256 d = deposited[user];
        uint256 w = withdrawn[user];
        return d > w ? d - w : 0;
    }

    function _requireSigner(bytes32 structHash, bytes calldata signature) internal view {
        address rec = ECDSA.recover(_hashTypedDataV4(structHash), signature);
        if (rec != withdrawalSigner) revert BadSignature();
    }
}
