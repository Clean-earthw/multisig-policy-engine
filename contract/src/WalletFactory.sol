// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./MultisigWallet.sol";
import "./GovernanceMultisig.sol";
import "./PolicyRegistry.sol";
import "./AuditLog.sol";
import "./PresetPolicyRegistry.sol";

contract WalletFactory {
    address public immutable walletSingleton;
    address public immutable governanceSingleton;
    address public immutable policyRegistrySingleton;
    address public immutable auditLogSingleton;
    address public immutable teeExtensionRegistry;
    address public immutable presetPolicyRegistry;

    struct WalletDeployment {
        address wallet;
        address governance;
        address policyRegistry;
        address auditLog;
    }

    mapping(address => WalletDeployment[]) public creatorWallets;
    mapping(address => uint256) public creatorWalletCount;

    event WalletCreated(
        address indexed creator,
        address indexed wallet,
        address indexed governance,
        address policyRegistry,
        address auditLog,
        address[] signers
    );

    constructor(
        address _walletSingleton,
        address _governanceSingleton,
        address _policyRegistrySingleton,
        address _auditLogSingleton,
        address _teeExtensionRegistry,
        address _presetPolicyRegistry
    ) {
        walletSingleton = _walletSingleton;
        governanceSingleton = _governanceSingleton;
        policyRegistrySingleton = _policyRegistrySingleton;
        auditLogSingleton = _auditLogSingleton;
        teeExtensionRegistry = _teeExtensionRegistry;
        presetPolicyRegistry = _presetPolicyRegistry;
    }

    // NEW: Create wallet with preset policies
    function createWallet(
        address[] calldata _signers,
        uint256[] calldata _presetPolicyIds
    ) external returns (WalletDeployment memory) {
        require(_signers.length > 0, "Need signers");

        // Clone all contracts
        address govProxy = Clones.clone(governanceSingleton);
        address policyRegProxy = Clones.clone(policyRegistrySingleton);
        address auditProxy = Clones.clone(auditLogSingleton);

        // Initialize governance
        GovernanceMultisig gov = GovernanceMultisig(govProxy);
        gov.initialize(_signers);

        // Initialize policy registry
        PolicyRegistry policyReg = PolicyRegistry(policyRegProxy);
        policyReg.initialize(govProxy);

        // Initialize audit log
        AuditLog audit = AuditLog(auditProxy);

        // Deploy wallet
        address walletProxy = Clones.clone(walletSingleton);
        MultisigWallet wallet = MultisigWallet(payable(walletProxy));
        wallet.initialize(auditProxy, teeExtensionRegistry, govProxy);

        // Add preset policies if provided
        if (_presetPolicyIds.length > 0) {
            policyReg.addPresetPolicies(_presetPolicyIds, _signers, presetPolicyRegistry);
        }
        policyReg.lockProvisioning();

        WalletDeployment memory deployment = WalletDeployment({
            wallet: walletProxy,
            governance: govProxy,
            policyRegistry: policyRegProxy,
            auditLog: auditProxy
        });

        creatorWallets[msg.sender].push(deployment);
        creatorWalletCount[msg.sender]++;

        emit WalletCreated(
            msg.sender,
            walletProxy,
            govProxy,
            policyRegProxy,
            auditProxy,
            _signers
        );

        return deployment;
    }

    // NEW: Create wallet without presets
    function createWalletNoPresets(
        address[] calldata _signers
    ) external returns (WalletDeployment memory) {
        uint256[] memory empty = new uint256[](0);
        return this.createWallet(_signers, empty);
    }

    function getWalletsForCreator(address _creator) external view returns (WalletDeployment[] memory) {
        return creatorWallets[_creator];
    }

    function getWalletForCreatorAtIndex(address _creator, uint256 _index) external view returns (WalletDeployment memory) {
        return creatorWallets[_creator][_index];
    }
}