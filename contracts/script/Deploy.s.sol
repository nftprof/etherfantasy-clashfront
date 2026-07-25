// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {ClashCTVault} from "../src/ClashCTVault.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * Deploy ClashCTVault behind an ERC1967 (UUPS) proxy.
 *
 *   ADMIN / owner (upgrade + config): 0xB2e3e82a95f5c4c47E30A5b420Ac4f99d32EF61f
 *
 * Env: CT_TOKEN, BURN_SUPPORTED(0/1), BURN_SINK(optional), WITHDRAWAL_SIGNER,
 *      DEV_VAULT, MODERATOR (the keeper's operational addr).
 *
 * forge script script/Deploy.s.sol --rpc-url $CHAIN_RPC --broadcast
 */
contract Deploy is Script {
    address constant ADMIN = 0xB2e3e82a95f5c4c47E30A5b420Ac4f99d32EF61f;

    function run() external {
        address ct = vm.envAddress("CT_TOKEN");
        bool burnSupported = vm.envOr("BURN_SUPPORTED", uint256(1)) == 1;
        address burnSink = vm.envOr("BURN_SINK", address(0));
        address signer = vm.envAddress("WITHDRAWAL_SIGNER");
        address devVault = vm.envAddress("DEV_VAULT");
        address moderator = vm.envAddress("MODERATOR");

        vm.startBroadcast();
        ClashCTVault impl = new ClashCTVault();
        bytes memory initData = abi.encodeCall(
            ClashCTVault.initialize,
            (ct, burnSupported, burnSink, signer, devVault, moderator, ADMIN)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        vm.stopBroadcast();

        // The proxy address is the vault the keeper + client talk to.
        // ClashCTVault vault = ClashCTVault(address(proxy));
        proxy; // silence unused
    }
}
