// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ClashCTVault} from "../src/ClashCTVault.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @dev Minimal burnable CT stand-in for tests.
contract MockCT is ERC20 {
    constructor() ERC20("Carat", "CT") {}
    function mint(address to, uint256 amt) external { _mint(to, amt); }
    function burn(uint256 amt) external { _burn(msg.sender, amt); }
}

contract ClashCTVaultTest is Test {
    MockCT ct;
    ClashCTVault vault;

    uint256 signerPk = 0xA11CE;
    address signer;
    address admin = address(0xB0B);
    address devVault = address(0xDEV);
    address moderator = address(0x6A6D);
    address alice = address(0xA1);

    function setUp() public {
        signer = vm.addr(signerPk);
        ct = new MockCT();
        ClashCTVault impl = new ClashCTVault();
        bytes memory initData = abi.encodeCall(
            ClashCTVault.initialize,
            (address(ct), true, address(0), signer, devVault, moderator, admin)
        );
        vault = ClashCTVault(address(new ERC1967Proxy(address(impl), initData)));
        ct.mint(alice, 1_000_000 ether);
    }

    function _deposit(address who, uint256 amt) internal {
        vm.startPrank(who);
        ct.approve(address(vault), amt);
        vault.deposit(amt);
        vm.stopPrank();
    }

    function _signWithdraw(address user, uint256 cum, uint256 deadline) internal view returns (bytes memory) {
        bytes32 typeHash = keccak256("Withdraw(address user,uint256 authorizedCumulative,uint256 deadline)");
        bytes32 structHash = keccak256(abi.encode(typeHash, user, cum, deadline));
        bytes32 digest = _typedDigest(structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _typedDigest(bytes32 structHash) internal view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("ClashCTVault")),
                keccak256(bytes("1")),
                block.chainid,
                address(vault)
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    function testDepositCreditsAndEmits() public {
        _deposit(alice, 100 ether);
        assertEq(vault.deposited(alice), 100 ether);
        assertEq(ct.balanceOf(address(vault)), 100 ether);
    }

    function testWithdrawPaysDelta() public {
        _deposit(alice, 100 ether);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _signWithdraw(alice, 40 ether, dl);
        vm.prank(alice);
        vault.withdraw(40 ether, dl, sig);
        assertEq(ct.balanceOf(alice), 900_000 ether - 100 ether + 40 ether);
        assertEq(vault.withdrawn(alice), 40 ether);
    }

    /// The hard anti-cheat invariant: even a valid signature can't exceed deposits.
    function testWithdrawCannotExceedDeposited() public {
        _deposit(alice, 100 ether);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _signWithdraw(alice, 150 ether, dl); // signer over-authorises
        vm.prank(alice);
        vm.expectRevert(ClashCTVault.ExceedsDeposited.selector);
        vault.withdraw(150 ether, dl, sig);
    }

    function testStaleVoucherReverts() public {
        _deposit(alice, 100 ether);
        uint256 dl = block.timestamp - 1;
        bytes memory sig = _signWithdraw(alice, 10 ether, dl);
        vm.prank(alice);
        vm.expectRevert(ClashCTVault.StaleVoucher.selector);
        vault.withdraw(10 ether, dl, sig);
    }

    function testCumulativeVoucherIsIdempotent() public {
        _deposit(alice, 100 ether);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _signWithdraw(alice, 30 ether, dl);
        vm.startPrank(alice);
        vault.withdraw(30 ether, dl, sig);
        vm.expectRevert(ClashCTVault.ZeroAmount.selector); // resubmitting the same cumulative pays nothing
        vault.withdraw(30 ether, dl, sig);
        vm.stopPrank();
        assertEq(vault.withdrawn(alice), 30 ether);
    }
}
