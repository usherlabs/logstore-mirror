// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

// Open Zeppelin libraries for controlling upgradability and access.
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {IStreamRegistry} from "./interfaces/StreamRegistry.sol";
import {StringsUpgradeable} from "./lib/StringsUpgradeable.sol";

// Owned by the NodeManager Contract
contract LogStoreManager is Initializable, UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    event StoreUpdated(string store, bool isNew, uint256 amount);
    event DataStored(string store, uint256 fees, uint256 bytesStored);
    event CaptureOverflow(string store, uint stake, uint capture, uint overflow);
    event SupplyOverflow(uint supply, uint capture, uint overflow);

    modifier onlyParent() {
        require(_msgSender() == parent, "error_onlyParent");
        _;
    }

    uint256 public totalSupply;
    address public stakeTokenAddress;
    mapping(string => uint256) public stores; // map of stores and their total balance
    mapping(string => address[]) public storeStakeholders; // map of stores and their stakeholders.
    mapping(address => uint256) public balanceOf; // map of addresses and their total balanace
    mapping(address => mapping(string => uint256)) public storeBalanceOf; // map of addresses and the stores they're staked in
    IERC20Upgradeable internal stakeToken;
    IStreamRegistry internal streamrRegistry;
    address internal parent;

    function initialize(
        address owner_,
        address parent_,
        address stakeTokenAddress_,
        address streamrRegistryAddress_
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        require(stakeTokenAddress_ != address(0), "error_badTrackerData");
        streamrRegistry = IStreamRegistry(streamrRegistryAddress_);
        stakeToken = IERC20Upgradeable(stakeTokenAddress_);
        stakeTokenAddress = stakeTokenAddress_;

        setParent(parent_);
        transferOwnership(owner_);
    }

    /// @dev required by the OZ UUPS module
    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setParent(address _parent) public onlyOwner {
        parent = _parent;
    }

    function exists(string calldata streamId) public view returns (bool) {
        return stores[streamId] > 0;
    }

    // Only the LogStore Contract can call the capture method
    function capture(string memory streamId, uint256 amount, uint256 bytesStored) public nonReentrant onlyParent {
        require(stores[streamId] > 0, "error_invalidStreamId");

        // Prevent overflow errors On-Chain
        // An overflow is where more data was processed than what has been staked for the relevant stream/store
        // Validators to index and manage any overflows.
        uint256 amountToTransfer = amount;
        if (stores[streamId] < amount) {
            emit CaptureOverflow(streamId, stores[streamId], amount, amount - stores[streamId]);
            amountToTransfer = stores[streamId];

            // Reset all stakeholders balances relative to the stream to 0
            address[] memory stakeholders = storeStakeholders[streamId];
            for (uint256 i = 0; i < stakeholders.length; i++) {
                address stakeholder = stakeholders[i];
                // Remove stake is stream from stakeholder balance, otherwise reset to 0 if balances are off.
                if (balanceOf[stakeholder] < storeBalanceOf[stakeholder][streamId]) {
                    balanceOf[stakeholder] = 0;
                } else {
                    balanceOf[stakeholder] -= storeBalanceOf[stakeholder][streamId];
                }
                storeBalanceOf[stakeholder][streamId] = 0;
            }
            // Remove all stakeholders from the stream since it's stake has been set to 0
            storeStakeholders[streamId] = new address[](0);

            // Set stake of stream to 0
            stores[streamId] = 0;
        } else {
            address[] memory stakeholders = storeStakeholders[streamId];
            // Determine the fee amounts proportional to each stakeholder stake amount
            for (uint256 i = 0; i < stakeholders.length; i++) {
                address stakeholder = stakeholders[i];
                uint256 stakeOwnership = storeBalanceOf[stakeholder][streamId] / stores[streamId];
                uint256 deduction = stakeOwnership * amount;
                if (balanceOf[stakeholder] < deduction) {
                    balanceOf[stakeholder] = 0;
                } else {
                    balanceOf[stakeholder] -= deduction;
                }
                if (storeBalanceOf[stakeholder][streamId] < deduction) {
                    storeBalanceOf[stakeholder][streamId] = 0;
                } else {
                    storeBalanceOf[stakeholder][streamId] -= deduction;
                }
                // if stake of a user is finished then remove from the list of delegates
                if (storeBalanceOf[stakeholder][streamId] == 0) {
                    storeStakeholders[streamId] = new address[](0);
                    for (uint256 j = 0; j < stakeholders.length; j++) {
                        if (stakeholders[j] != stakeholder) {
                            storeStakeholders[streamId].push(stakeholder);
                        }
                    }
                }
            }

            stores[streamId] -= amount;
        }

        if (totalSupply < amount) {
            emit SupplyOverflow(totalSupply, amount, amount - totalSupply);
            totalSupply = 0;
        } else {
            totalSupply -= amount;
        }

        require(amountToTransfer <= stakeToken.balanceOf(address(this)), "error_insufficientStake");

        bool transferSuccess = stakeToken.transfer(msg.sender, amountToTransfer);
        require(transferSuccess == true, "error_unsuccessfulCapture");

        emit DataStored(streamId, amount, bytesStored);
    }

    function stake(string memory streamId, uint amount) public {
        // Validate stream is inside of StreamrRegiststry
        require(streamrRegistry.exists(streamId), "error_invalidStream");
        require(amount > 0, "error_insufficientStake");

        bool success = stakeToken.transferFrom(msg.sender, address(this), amount);
        require(success == true, "error_unsuccessfulStake");

        bool isNew = false;
        if (stores[streamId] == 0) {
            isNew = true;
        }
        stores[streamId] += amount;
        balanceOf[msg.sender] += amount;
        if (storeBalanceOf[msg.sender][streamId] == 0) {
            storeStakeholders[streamId].push(msg.sender);
        }
        storeBalanceOf[msg.sender][streamId] += amount;
        totalSupply += amount;
        emit StoreUpdated(streamId, isNew, amount);
    }
}
