//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * Vesting of an ERC20 token that it is set at construction time.
 * The ERC20 vesting token cannot be changed.
 * Vesting must be funded with the ERC20.
 * Schedules are created by Vesting's owner.
 */
contract Vesting is Ownable {
    using SafeERC20 for IERC20;

    struct VestingSchedule {
        bool initialized;
        address beneficiary;
        uint256 cliff;
        uint256 start;
        uint256 duration;
        uint256 slicePeriodSeconds;
        bool revocable;
        uint256 amountTotal;
        uint256 released;
        bool revoked;
    }

    // Address of the ERC20 vesting token
    IERC20 private immutable _token;

    bytes32[] private vestingSchedulesIds;
    mapping(bytes32 => VestingSchedule) private vestingSchedules;
    uint256 private vestingSchedulesTotalAmount;
    mapping(address => uint256) private holdersVestingCount;

    event Released(bytes32 scheduleId, uint256 amount, address holder);
    event Revoked(bytes32 scheduleId, uint256 revokedAmount, address holder);

    /**
     * @dev Reverts if no vesting schedule matches the passed identifier.
     */
    modifier onlyIfExists(bytes32 vestingScheduleId) {
        require(
            vestingSchedules[vestingScheduleId].initialized == true,
            "Schedule not initialized"
        );
        _;
    }

    /**
     * @dev Reverts if the vesting schedule has been revoked.
     */
    modifier onlyIfNotRevoked(bytes32 vestingScheduleId) {
        require(
            vestingSchedules[vestingScheduleId].revoked == false,
            "Schedule has been revoked"
        );
        _;
    }

    /**
     * @dev Creates a vesting contract. `token` is the vesting token address,
     * and cannot be changed after construction.
     */
    constructor(address token) {
        require(token != address(0x0));
        _token = IERC20(token);
    }

    /**
     * @dev Release vested amount of tokens for `vestingScheduleId`.
     * Caller must be the owner or the beneficiary
     */
    function release(bytes32 vestingScheduleId) external {
        uint256 amount = _release(vestingScheduleId);
        require(amount > 0, "No amount to release");
    }

    /**
     * @dev Release all the releasable tokens for the caller.
     * Reverts if there is no releasable amount.
     */
    function releaseAllMySchedules() external {
        address sender = msg.sender;
        uint256 count = holdersVestingCount[sender];
        uint256 totAmt;

        require(count > 0, "No schedules found");

        for (uint256 i = 0; i < count; i++) {
            bytes32 vestingScheduleId = computeScheduleId(sender, i);
            VestingSchedule storage schedule = vestingSchedules[
                vestingScheduleId
            ];
            if (!schedule.revoked) {
                totAmt += _release(vestingScheduleId);
            }
        }

        require(totAmt > 0, "No releasable amount");
    }

    /**
     * @dev Returns the number of all vesting schedules.
     */
    function getScheduleCount() external view returns (uint256) {
        return vestingSchedulesIds.length;
    }

    /**
     * @dev Returns the vesting schedule id at the given `index`.
     */
    function getScheduleIdAt(uint256 index) external view returns (bytes32) {
        require(index < vestingSchedulesIds.length, "Index out of bounds");
        return vestingSchedulesIds[index];
    }

    /**
     * @dev Returns the number of vesting schedules associated
     * to `beneficiary`.
     */
    function getScheduleCountHolder(address beneficiary)
        external
        view
        returns (uint256)
    {
        return holdersVestingCount[beneficiary];
    }

    /**
     * @dev Returns the VestingSchedule for `holder` and `index`.
     */
    function getScheduleAtHolder(address holder, uint256 index)
        external
        view
        returns (VestingSchedule memory)
    {
        return getSchedule(computeScheduleId(holder, index));
    }

    /**
     * @dev Returns the last vesting schedule for `holder`.
     */
    function getLastSchedule(address holder)
        external
        view
        returns (VestingSchedule memory)
    {
        return
            vestingSchedules[
                computeScheduleId(holder, holdersVestingCount[holder] - 1)
            ];
    }

    /**
     * @dev Returns the vesting schedule for `vestingScheduleId`.
     */
    function getSchedule(bytes32 vestingScheduleId)
        public
        view
        returns (VestingSchedule memory)
    {
        return vestingSchedules[vestingScheduleId];
    }

    /**
     * @dev Returns the total amount of vesting schedules.
     */
    function getTotalVestingAmount() external view returns (uint256) {
        return vestingSchedulesTotalAmount;
    }

    /**
     * @dev Returns the address of the ERC20 token managed by the vesting contract.
     */
    function getToken() external view returns (address) {
        return address(_token);
    }

    /**
     * @dev Returns all releasable amount of all schedules for the caller
     */
    function computeAmountForAllMySchedules() external view returns (uint256) {
        address sender = msg.sender;
        uint256 releasableAmt;
        uint256 count = holdersVestingCount[sender];
        if (count == 0) {
            return 0;
        }

        for (uint256 i = 0; i < count; i++) {
            bytes32 scheduleId = computeScheduleId(sender, i);
            releasableAmt += _computeReleasableAmount(scheduleId);
        }
        return releasableAmt;
    }

    /**
     * @notice Computes the releasable amount for the given `vestingScheduleId`.
     */
    function computeReleasableAmount(bytes32 vestingScheduleId)
        external
        view
        onlyIfExists(vestingScheduleId)
        onlyIfNotRevoked(vestingScheduleId)
        returns (uint256)
    {
        return _computeReleasableAmount(vestingScheduleId);
    }

    /**
     * @dev Returns the amount of unused funds that can be withdrawn
     * by the owner.
     */
    function getWithdrawableAmount() public view returns (uint256) {
        return _token.balanceOf(address(this)) - vestingSchedulesTotalAmount;
    }

    /**
     * @dev Computes the next vesting schedule identifier for a given holder address.
     */
    function computeNextSecheduleId(address holder)
        public
        view
        returns (bytes32)
    {
        return computeScheduleId(holder, holdersVestingCount[holder]);
    }

    /**
     * @dev Computes the vesting schedule identifier for an address and an index.
     */
    function computeScheduleId(address holder, uint256 index)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(holder, index));
    }

    // --- onlyOwner ---

    /**
     * @dev Creates a new vesting schedule for a beneficiary.
     */
    function createVestingSchedule(
        address _beneficiary,
        uint256 _start,
        uint256 _cliff,
        uint256 _duration,
        uint256 _slicePeriodSeconds,
        bool _revocable,
        uint256 _amount
    ) public onlyOwner {
        require(this.getWithdrawableAmount() >= _amount, "Not enough funds");
        require(_duration > 0, "Duration cannot be zero");
        require(_amount > 0, "Amount cannot be zero");
        require(_slicePeriodSeconds > 0, "SlicePeriodSeconds cannot be zero");
        bytes32 vestingScheduleId = computeNextSecheduleId(_beneficiary);
        uint256 cliff = _start + _cliff;
        vestingSchedules[vestingScheduleId] = VestingSchedule(
            true,
            _beneficiary,
            cliff,
            _start,
            _duration,
            _slicePeriodSeconds,
            _revocable,
            _amount,
            0,
            false
        );
        vestingSchedulesTotalAmount += _amount;
        vestingSchedulesIds.push(vestingScheduleId);
        holdersVestingCount[_beneficiary] += 1;
    }

    /**
     * @dev Release all pending tokens and revoke the vesting schedule
     * for `vestingScheduleId`.
     */
    function revoke(bytes32 scheduleId)
        public
        onlyOwner
        onlyIfExists(scheduleId)
        onlyIfNotRevoked(scheduleId)
    {
        VestingSchedule storage schedule = vestingSchedules[scheduleId];

        require(schedule.revocable == true, "Vesting is not revocable");

        _release(scheduleId);

        uint256 revokedAmount = schedule.amountTotal -schedule.released;
        vestingSchedulesTotalAmount -= revokedAmount;
        schedule.revoked = true;
        
        emit Revoked(scheduleId, revokedAmount, schedule.beneficiary);
    }

    /**
     * @dev Withdraw any unused funds.
     */
    function withdraw(uint256 amount) external onlyOwner {
        require(
            this.getWithdrawableAmount() >= amount,
            "Not enough withdrawable funds"
        );
        _token.safeTransfer(owner(), amount);
    }

    // --- private --

    /**
     * @dev Release all available tokens for `vestingScheduleId`.
     * Returns the amount released. Can be zero.
     */
    function _release(bytes32 scheduleId)
        private
        onlyIfExists(scheduleId)
        onlyIfNotRevoked(scheduleId)
        returns (uint256)
    {
        VestingSchedule storage schedule = vestingSchedules[scheduleId];
        address sender = msg.sender;
        address beneficiary = schedule.beneficiary;
        bool isBeneficiary = (sender == beneficiary);
        bool isOwner = (sender == owner());
        require(
            isBeneficiary || isOwner,
            "Only beneficiary and owner can release vested tokens"
        );

        uint256 amount = _computeReleasableAmount(scheduleId);
        if (amount == 0) {
            return 0;
        }

        schedule.released += amount;
        vestingSchedulesTotalAmount -= amount;

        _token.safeTransfer(beneficiary, amount);

        emit Released(scheduleId, amount, beneficiary);

        return amount;
    }

    /**
     * @dev Returns the releasable amount of tokens for `vestingScheduleId`
     */
    function _computeReleasableAmount(bytes32 vestingScheduleId)
        internal
        view
        returns (uint256)
    {
        uint256 currentTime = getCurrentTime();
        VestingSchedule storage schedule = vestingSchedules[vestingScheduleId];
        if ((currentTime < schedule.cliff) || schedule.revoked == true) {
            return 0;
        } else if (currentTime >= schedule.start + schedule.duration) {
            return schedule.amountTotal - schedule.released;
        } else {
            uint256 slicePeriods = (currentTime - schedule.start) /
                schedule.slicePeriodSeconds;
            uint256 vestedSeconds = slicePeriods * schedule.slicePeriodSeconds;
            uint256 amount = (schedule.amountTotal * vestedSeconds) /
                schedule.duration;
            return (amount - schedule.released);
        }
    }

    function getCurrentTime() internal view virtual returns (uint256) {
        return block.timestamp;
    }
}
