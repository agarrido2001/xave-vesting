<span style="color:red;">The purpose of this repository is to showcase some of the projects that I have created at Xave. This is not the official Xave repository.</span>

# Vesting

The _Vesting_ smart contract facilitates the vesting of ERC20 tokens, by receiving the funds of that ERC20 and defining the terms of their withdrawal.

## Schedules
The withdrawal of tokens is established by creating schedules. Only the owner of _Vesting_ can create or cancel schedules. A schedule is a structure with the following information:


**Beneficiary**: Address that will receive the ERC20 tokens.  
**Start**: Start date of the Schedule (epoch in seconds).  
**Cliff**: Time (in seconds) to wait from **Start**. During this time, beneficiary cannot withdraw the ERC20 tokens. The amount is still calculated from **Start**.  
**Duration**: Duration (in seconds) of the Schedule.  
**SlicePeriodSeconds**: Time (in seconds) for each delivery cut-off.  
**Revocable**: Whether the schedule can be cancelled or not.  
**AmountTotal**: The total amount of ERC20 tokens to be delivered to **beneficiary**.  
**Released**: Amount delivered so far.  
**Revoked**: Whether it has been cancelled or not.

Once a non-revocable _schedule_ has been created, the tokens specified in **AmountTotal** are reserved, and **only the beneficiary can withdraw them** while complying with the rules of the schedule.

If the schedule is revocable, the owner of _Vesting_ can [cancel it](#cancellation-of-a-schedule).


## Example
For the following schedule, _Vesting_ takes 1200 tokens from the total it holds, and assigns them to the beneficiary.  

**Beneficiary**:  0X…123  
**Start**: 1645456136 (July 1st, 2022)  
**Cliff**: 0  
**Duration**: 31104000 (360 days)  
**SlicePeriodSeconds**: 2592000 (30 days)  
**Revocable**: false  
**AmountTotal**: 1200  
**Revoked**: false  

The 1200 tokens are prorated over 360 days, delivering the proportional amount every 30 days. That is 100 tokens every 30 days.  


|Date|Available for withdrawal|Withdrawn|Balance
| --- | :---: | :---: | :---: |
|May 30|0|0|1200|
|July 29|0|0|1200|
|August 1|100|0|1200|
|September 1|200|200|1000|
|July 1, 2023|1000|1000|0|

## Calculations for token delivery
When creating a schedule, it is convenient for the calculation of the number of tokens per delivery to result in an integer. If it is not, then _Vesting_ ignores the decimals.  

Example:

AmountTotal = 1000  
Duration = 31536000 (365 days)  
SlicePeriodSeconds = 302400 (3.5 days)  

In this example, for a period of 365 days, the amount of tokens to be delivered every 3.5 days is 9.589041 = ((1000/365) * 3.5). But, since only whole quantities of ERC20 are delivered, _Vesting_ will make 9 tokens available to the beneficiary at the 3.5 day mark.  
**However, the 0.589041 is not lost**. Any remainder will be available at the end of the schedule.  

For the same example, if the beneficiary does not withdraw tokens until after 7 days (2 cut-off periods), on day 7 they will be able to withdraw the whole part of two periods together: 19 tokens (9.589041 * 2 = 19.17808). One token more than if they withdraw every 3.5 days.

## How to use _Vesting_  

1 - Deploy the Vesting.sol contract and pass the ERC20 token as a parameter 
```
Vesting.deploy(ERC20Token.address);
```

2 -	A holder of the ERC20 token, preferably _Vesting's_ owner, sends funds to _Vesting_
```
 ERC20Token.transfer(Vesting.address, 1000)
```

3 - The ERC20 tokens held by _Vesting_ can be withdrawn with the withdraw function, as long as that amount is not committed in the schedules. This function transfers the tokens to the **owner of _Vesting_**

```
uint256 amount = Vesting.getWithdrawableAmount();

Vesting.withdraw(amount);
```

4 - The owner creates one or more schedules. This function verifies that _Vesting_ has tokens available for the new schedule.
```
Vesting.createVestingSchedule(
    beneficiary: 0X…123,
    start: 1645456136, // July 1st, 2022
    cliff: 0,
    duration: 31104000, // 360 days
    slicePeriodSeconds: 2592000, // 30 days
    revocable: false,
    amount: 12000
)
```
4 - Each schedule is assigned a scheduleId. This id is necessary to interact with a schedule, and it is obtained as follows:
```
bytes32 vestingScheduleId = Vesting.getLastSchedule(address beneficiary)
```
or
```
bytes32 vestingScheduleId = Vesting.computeScheduleId(address holder, uint256 index)
```
Where `index` is a zero based counter of schedules for that holder.  

5 -  With the scheduleId, you can find the amount that can be released for that schedule at execution time using the function:
```
uint256 amount = Vesting.computeReleasableAmount(vestingScheduleId)
```

The beneficiary can also check the amount of ERC20 tokens that can be released up to that moment, without the need to calculate their scheduleId

```
uint256 amount = Vesting.computeAmountForAllMySchedules()
```

6 - The beneficiary or _Vesting_'s owner can transfer all available tokens to the beneficiary
```
Vesting.release(vestingScheduleId)
```
Or the beneficiary, can transfer its available tokens up to that moment in all its assiged schedules, without needing to calculate their scheduleID
```
Vesting.releaseAllMySchedules()
```

These instructions describe how to interact with vesting schedules in a more specific and independent way, particularly if the user is not the beneficiary. Here are the steps:


1 - First, obtain the number of schedules assigned to the beneficiary address:
```
uint256 scheduleCount = Vesting.getScheduleCountHolder(address)
```
2 - Next, obtain the vesting schedule ID for each schedule using its index number, where 0 is the first index. If `scheduleCount` is 2, the vesting schedule IDs can be obtained as follows:
```
bytes32 vestingScheduleId_1 = Vesting.computeScheduleId(address,0);

bytes32 vestingScheduleId_2 = Vesting.computeScheduleId(address,1);

```
3 - Compute the amount available for withdrawal at the current time for each `vestingScheduleId`:
```
uint256 amount_1 = Vesting.computeReleasableAmount(vestingScheduleId_1)

uint256 amount_2 = Vesting.computeReleasableAmount(vestingScheduleId_2)

```
3 - Finally, release the tokens for each `vestingScheduleId`:
```
Vesting.release(vestingScheduleId_1)
Vesting.release(vestingScheduleId_2)
```

## Helper functions
<u>getToken()</u>: Returns the ERC20 vesting token address.   
<u>getTotalVestingAmount()</u>: Returns the amount loked in schedules.  
<u>getWithdrawableAmount()</u>: Returns the amount of funds not locked.

<u>getScheduleCount()</u>: Returns the total amount of schedules.  
<u>getScheduleIdAt(uint256 index)</u>: Returns the schedule info at index.  
<u>getScheduleCountHolder(address beneficiary)</u>: Returns the amount of schedules for one holder.  
<u>getScheduleAtHolder(address holder, uint256 index)</u>: Returns the schedule info for one holder at index.  
<u>getSchedule(bytes32 vestingScheduleId)</u>: Returns the schedule info for one schedule ID.


## Cancellation of a schedule
If a schedule is revocable, then the owner of _Vesting_ can revoke it. This function first checks if the schedule has tokens pending for delivery at the time of execution. **If it does, it transfers them to the beneficiary**. The remaining undelivered tokens (if any) become available for new schedules or for withdrawal.

```
Vesting.revoke(vestingScheduleId)
```
