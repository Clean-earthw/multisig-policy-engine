// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "./interface/IPresetPolicyRegistry.sol";

contract PolicyRegistry is Initializable {
    address public governanceMultisig;
    address public provisioner;
    bool public provisioningLocked;

    struct Conditions {
        address[] targetAddresses;
        bytes4[] functionSelectors;
        uint256 minValue;
        uint256 maxValue;
        uint256 timeWindowStart;
        uint256 timeWindowEnd;
        bool requireVerified;
        bool requireErc7730;
    }

    struct Limits {
        uint256 maxValuePerTxUsd;
        uint256 maxValueDailyUsd;
        address[] allowlist;
        address[] denylist;
    }

    struct Policy {
        uint256 id;
        string name;
        bool active;
        Conditions conditions;
        Limits limits;
        address[] signers;
        uint8 riskWeight;
        uint256 createdAt;
        uint256 updatedAt;
    }

    Policy[] public policies;
    uint256 public nextPolicyId;

    event PolicyAdded(uint256 indexed policyId, string name);
    event ProvisioningLocked();

    modifier onlyGovernance() {
        require(msg.sender == governanceMultisig, "Only governance multisig");
        _;
    }

    modifier onlyGovernanceOrProvisioner() {
        require(
            msg.sender == governanceMultisig || (!provisioningLocked && msg.sender == provisioner),
            "Only governance or provisioner"
        );
        _;
    }

    function initialize(address _governanceMultisig) external initializer {
        governanceMultisig = _governanceMultisig;
        provisioner = msg.sender;
    }

    constructor() {}

    function lockProvisioning() external {
        require(msg.sender == provisioner, "Only provisioner");
        require(!provisioningLocked, "Already locked");
        provisioningLocked = true;
        emit ProvisioningLocked();
    }

    function getPolicyCount() external view returns (uint256) {
        return policies.length;
    }

    function getPolicy(uint256 _index) external view returns (Policy memory) {
        return policies[_index];
    }

    function getActivePolicies() external view returns (Policy[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].active) count++;
        }
        Policy[] memory active = new Policy[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].active) {
                active[j++] = policies[i];
            }
        }
        return active;
    }

    function getPolicySigners(uint256 _policyId) external view returns (address[] memory) {
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].id == _policyId) return policies[i].signers;
        }
        revert("Policy not found");
    }

    function getPolicyLimits(uint256 _policyId) external view returns (Limits memory) {
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].id == _policyId) return policies[i].limits;
        }
        revert("Policy not found");
    }

    function addPolicy(
        string calldata _name,
        Conditions calldata _conditions,
        Limits calldata _limits,
        address[] calldata _signers,
        uint8 _riskWeight
    ) external onlyGovernanceOrProvisioner returns (uint256) {
        return _addPolicyInternal(_name, _conditions, _limits, _signers, _riskWeight);
    }

    // NEW: Add multiple preset policies at once
    function addPresetPolicies(
        uint256[] calldata _presetIds,
        address[] calldata _signers,
        address _presetRegistry
    ) external onlyGovernanceOrProvisioner returns (uint256[] memory) {
        uint256 len = _presetIds.length;
        uint256[] memory addedIds = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            addedIds[i] = _addPresetPolicy(_presetRegistry, _presetIds[i], _signers);
        }
        return addedIds;
    }

    // NEW: Add single preset policy
    function _addPresetPolicy(
        address _registry,
        uint256 _presetId,
        address[] memory _signers
    ) internal returns (uint256) {
        IPresetPolicyRegistry reg = IPresetPolicyRegistry(_registry);

        Conditions memory conditions = Conditions({
            targetAddresses: reg.presetTargetAddresses(_presetId),
            functionSelectors: reg.presetFunctionSelectors(_presetId),
            minValue: reg.presetMinValue(_presetId),
            maxValue: reg.presetMaxValue(_presetId),
            timeWindowStart: reg.presetTimeWindowStart(_presetId),
            timeWindowEnd: reg.presetTimeWindowEnd(_presetId),
            requireVerified: reg.presetRequireVerified(_presetId),
            requireErc7730: reg.presetRequireErc7730(_presetId)
        });

        Limits memory limits = Limits({
            maxValuePerTxUsd: reg.presetMaxValuePerTxUsd(_presetId),
            maxValueDailyUsd: reg.presetMaxValueDailyUsd(_presetId),
            allowlist: reg.presetAllowlist(_presetId),
            denylist: reg.presetDenylist(_presetId)
        });

        return _addPolicyInternal(
            reg.presetName(_presetId),
            conditions,
            limits,
            _signers,
            reg.presetRiskWeight(_presetId)
        );
    }

    function _addPolicyInternal(
        string memory _name,
        Conditions memory _conditions,
        Limits memory _limits,
        address[] memory _signers,
        uint8 _riskWeight
    ) internal returns (uint256) {
        require(_signers.length > 0, "Must have signers");
        require(_riskWeight >= 1 && _riskWeight <= 10, "Weight 1-10");

        uint256 id = nextPolicyId++;
        policies.push();
        Policy storage p = policies[policies.length - 1];
        p.id = id;
        p.name = _name;
        p.active = true;
        p.conditions = _conditions;
        p.limits = _limits;
        p.signers = _signers;
        p.riskWeight = _riskWeight;
        p.createdAt = block.number;
        p.updatedAt = block.number;
        emit PolicyAdded(id, _name);
        return id;
    }

    function updatePolicy(
        uint256 _policyId,
        string calldata _name,
        Conditions calldata _conditions,
        Limits calldata _limits,
        address[] calldata _signers,
        uint8 _riskWeight
    ) external onlyGovernance {
        require(_signers.length > 0, "Must have signers");
        require(_riskWeight >= 1 && _riskWeight <= 10, "Weight 1-10");
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].id == _policyId) {
                policies[i].name = _name;
                policies[i].conditions = _conditions;
                policies[i].limits = _limits;
                policies[i].signers = _signers;
                policies[i].riskWeight = _riskWeight;
                policies[i].updatedAt = block.number;
                return;
            }
        }
        revert("Policy not found");
    }

    function deactivatePolicy(uint256 _policyId) external onlyGovernance {
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].id == _policyId) {
                policies[i].active = false;
                policies[i].updatedAt = block.number;
                return;
            }
        }
        revert("Policy not found");
    }

    function reactivatePolicy(uint256 _policyId) external onlyGovernance {
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].id == _policyId) {
                policies[i].active = true;
                policies[i].updatedAt = block.number;
                return;
            }
        }
        revert("Policy not found");
    }
}