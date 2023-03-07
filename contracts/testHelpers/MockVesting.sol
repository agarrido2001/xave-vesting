//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "../Vesting.sol";

/**
 * @title MockTokenVesting
 * WARNING: use only for testing and debugging purpose
 */
contract MockVesting is Vesting{

    uint256 mockTime = 0;

    constructor(address token_) Vesting(token_){
    }

    function setCurrentTime(uint256 _time)
        external{
        mockTime = _time;
    }

    function getCurrentTime()
        internal
        virtual
        override
        view
        returns(uint256){
        return mockTime;
    }

    function getCurrentMockedTime() external view returns(uint256) {
        return mockTime;
    }
}
