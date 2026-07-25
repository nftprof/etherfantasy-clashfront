// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @dev CT tokens that expose a native burn(); else the sweep uses BURN_SINK (0x…dEaD).
interface IBurnableERC20 {
    function burn(uint256 amount) external;
}

/**
 * @title ClashCTVault (UUPS upgradeable)
 * @notice The on-chain coin-slot + ticket-dispenser for Clash Front's CT economy
 *         (docs: ECONOMY-MASTER-SUMMARY §0b, docs/briefs/CT-VAULT-AND-KEEPER.md).
 *
 *         Server-authoritative: the backend holds the ONLY authoritative balances
 *         (gold, resources, spendable CT). This vault is the money boundary:
 *
 *         DEPOSIT  — CT in. `deposited[user]` rises; `Deposit` event → the keeper
 *                    credits the backend ledger (idempotent). CT enters ONLY here.
 *         WITHDRAW — CT out, against a backend-signed EIP-712 CUMULATIVE voucher.
 *                    HARD invariant: `withdrawn[user] <= deposited[user]` (W <= D).
 *                    A compromised signer can never exceed a user's own deposits.
 *                    (In-game CT a player EARNS from the redistribution pool is
 *                    spendable in-game but NOT withdrawable beyond deposits — the
 *                    backend caps it; on-chain W<=D is the backstop.)
 *         SWEEP    — house cut out: >= MIN_BURN_BPS (10%) BURNED (net-sink), the
 *                    rest to the developer vault. `minReserveAfter` protects user
 *                    withdrawals from an over-sweep.
 *
 *         ROLES: `owner` (= admin) upgrades + configures + is funds-critical.
 *                `moderator` (= the keeper's operational role) may pause for
 *                incident response. The withdrawal/sweep SIGNER is a separate key.
 *
 * @dev SECURITY: unaudited — audit before mainnet. Deploy behind an ERC1967 proxy;
 *      the admin (owner) should be a timelock + multisig.
 */
contract ClashCTVault is
    Initializable,
    UUPSUpgradeable,
    Ownable2StepUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    EIP712Upgradeable
{
    using SafeERC20 for IERC20;

    // ── Config (storage — set at initialize; upgradeable, so not immutable) ────
    IERC20 public CT;               // the CT token (Pentagon Chain ERC-20)
    bool public burnSupported;      // token exposes burn()?
    address public burnSink;        // fallback burn address if not
    uint16 public constant MIN_BURN_BPS = 1000; // >=10% of every sweep burns (hard floor)

    // ── Roles ─────────────────────────────────────────────────────────────────
    address public withdrawalSigner; // backend key that signs withdrawal + sweep vouchers
    address public devVault;         // receives the non-burned house cut
    address public moderator;        // keeper's operational role — pause only (no funds power)

    // ── Per-user accounting (the on-chain source of truth for W <= D) ─────────
    mapping(address => uint256) public deposited; // cumulative CT deposited (monotonic)
    mapping(address => uint256) public withdrawn;  // cumulative CT withdrawn  (monotonic)
    uint256 public depositNonce;                   // monotonic id for Deposit events
    mapping(bytes32 => bool) public usedSweepNonce;

    // ── Aggregates ─────────────────────────────────────────────────────────────
    uint256 public totalDeposited;
    uint256 public totalWithdrawn;
    uint256 public totalBurned;
    uint256 public totalToVault;

    // ── EIP-712 typehashes ──────────────────────────────────────────────────────
    bytes32 private constant WITHDRAW_TYPEHASH =
        keccak256("Withdraw(address user,uint256 authorizedCumulative,uint256 deadline)");
    bytes32 private constant SWEEP_TYPEHASH =
        keccak256("Sweep(uint256 burnAmount,uint256 vaultAmount,uint256 minReserveAfter,bytes32 nonce,uint256 deadline)");

    event Deposit(address indexed user, uint256 amount, uint256 indexed depositId);
    event Withdraw(address indexed user, uint256 amount, uint256 authorizedCumulative);
    event HouseSwept(uint256 burnAmount, uint256 vaultAmount);
    event SignerChanged(address indexed signer);
    event DevVaultChanged(address indexed devVault);
    event ModeratorChanged(address indexed moderator);

    error ZeroAmount();
    error ExceedsDeposited();
    error StaleVoucher();
    error BadSignature();
    error NonceUsed();
    error BurnFloor();
    error ReserveBreach();
    error NotModerator();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @param ct            CT token address (Pentagon Chain)
     * @param burnSupported_ token exposes burn()?
     * @param burnSink_     fallback burn address (0 → 0x…dEaD)
     * @param signer        backend withdrawal/sweep signer
     * @param vault         developer vault (non-burned house cut)
     * @param moderator_    keeper operational role (pause only)
     * @param admin         owner/admin — upgrade + config (intended:
     *                      0xB2e3e82a95f5c4c47E30A5b420Ac4f99d32EF61f, a multisig/timelock)
     */
    function initialize(
        address ct,
        bool burnSupported_,
        address burnSink_,
        address signer,
        address vault,
        address moderator_,
        address admin
    ) external initializer {
        require(ct != address(0) && signer != address(0) && vault != address(0) && admin != address(0), "zero addr");
        __UUPSUpgradeable_init();
        __Ownable2Step_init();
        __Ownable_init(admin);
        __Pausable_init();
        __ReentrancyGuard_init();
        __EIP712_init("ClashCTVault", "1");
        CT = IERC20(ct);
        burnSupported = burnSupported_;
        burnSink = burnSink_ == address(0) ? address(0x000000000000000000000000000000000000dEaD) : burnSink_;
        withdrawalSigner = signer;
        devVault = vault;
        moderator = moderator_;
    }

    /// @dev UUPS: only the owner/admin may upgrade the implementation.
    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ── DEPOSIT ────────────────────────────────────────────────────────────────

    function deposit(uint256 amount) external whenNotPaused nonReentrant {
        _deposit(msg.sender, amount);
    }

    function depositFor(address to, uint256 amount) external whenNotPaused nonReentrant {
        require(to != address(0), "zero to");
        _deposit(to, amount);
    }

    function _deposit(address user, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        uint256 before = CT.balanceOf(address(this)); // measure ACTUAL received (fee-on-transfer safe)
        CT.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = CT.balanceOf(address(this)) - before;
        if (received == 0) revert ZeroAmount();
        deposited[user] += received;
        totalDeposited += received;
        uint256 id = ++depositNonce;
        emit Deposit(user, received, id);
    }

    // ── WITHDRAW (backend-authorised, W <= D enforced) ─────────────────────────

    function withdraw(uint256 authorizedCumulative, uint256 deadline, bytes calldata signature)
        external
        whenNotPaused
        nonReentrant
    {
        if (block.timestamp > deadline) revert StaleVoucher();
        if (authorizedCumulative > deposited[msg.sender]) revert ExceedsDeposited(); // anti-cheat backstop
        bytes32 structHash = keccak256(abi.encode(WITHDRAW_TYPEHASH, msg.sender, authorizedCumulative, deadline));
        _requireSigner(structHash, signature);

        uint256 already = withdrawn[msg.sender];
        if (authorizedCumulative <= already) revert ZeroAmount();
        uint256 amount = authorizedCumulative - already;
        withdrawn[msg.sender] = authorizedCumulative;
        totalWithdrawn += amount;
        CT.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, amount, authorizedCumulative);
    }

    // ── HOUSE CUT SWEEP (>=10% burn floor, rest to dev vault) ──────────────────

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
        if (uint256(burnAmount) * 10000 < total * MIN_BURN_BPS) revert BurnFloor();

        bytes32 structHash =
            keccak256(abi.encode(SWEEP_TYPEHASH, burnAmount, vaultAmount, minReserveAfter, nonce, deadline));
        _requireSigner(structHash, signature);
        usedSweepNonce[nonce] = true;

        if (CT.balanceOf(address(this)) < total + minReserveAfter) revert ReserveBreach();

        totalBurned += burnAmount;
        totalToVault += vaultAmount;
        if (vaultAmount > 0) CT.safeTransfer(devVault, vaultAmount);
        if (burnAmount > 0) _burn(burnAmount);
        emit HouseSwept(burnAmount, vaultAmount);
    }

    function _burn(uint256 amount) internal {
        if (burnSupported) IBurnableERC20(address(CT)).burn(amount);
        else CT.safeTransfer(burnSink, amount);
    }

    // ── Admin / moderator ───────────────────────────────────────────────────────

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

    function setModerator(address m) external onlyOwner {
        moderator = m;
        emit ModeratorChanged(m);
    }

    /// @notice Moderator (keeper) or owner may pause instantly (incident response).
    function pause() external {
        if (msg.sender != moderator && msg.sender != owner()) revert NotModerator();
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Rescue non-CT tokens accidentally sent here — NEVER the CT token.
    function rescueForeignToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(CT), "cannot touch CT");
        IERC20(token).safeTransfer(to, amount);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function withdrawableCeiling(address user) external view returns (uint256) {
        uint256 d = deposited[user];
        uint256 w = withdrawn[user];
        return d > w ? d - w : 0;
    }

    function _requireSigner(bytes32 structHash, bytes calldata signature) internal view {
        if (ECDSA.recover(_hashTypedDataV4(structHash), signature) != withdrawalSigner) revert BadSignature();
    }

    /// @dev Storage gap for safe upgrades.
    uint256[40] private __gap;
}
