const { expect } = require("chai");

describe("Vesting Test", function () {
    let testToken;
    let vesting;
    let owner;
    let addr1;
    let addr2;
    let addrs;

    // Set debugPrint to "true" to print additional info to the constole
    let debugPrint = false;
    function prt(msg){
        if(debugPrint){
            console.log("\t\t" + msg);
        }
    }

    before(async function () {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        const Token = await ethers.getContractFactory("TestToken");
        testToken = await Token.deploy("Test Token", "TT", 1000000);
        await testToken.deployed();
        console.log("\tTestToken (erc20) deployed with total supply of", (await testToken.totalSupply()).toNumber(), "at", testToken.address);

        const Vesting = await ethers.getContractFactory("MockVesting");
        vesting = await Vesting.deploy(testToken.address);
        await vesting.deployed();
        console.log("\tDeployed MockVesting (child of Vesting.sol to mock elapsed time) at", vesting.address);

        // owner sends 1000 testTokens to vesting
        await testToken.transfer(vesting.address, 1000);

    });

    describe("Check initial amounts", function () {
        it("Vesting should have 1000 testTokens", async function () {
            expect(await testToken.balanceOf(vesting.address)).to.be.equal(1000);
        });

        it("Withdrawable amount should be the same as testToken.balanceOf vesting: 1000", async function () {
            const amt = await testToken.balanceOf(vesting.address);
            expect(await vesting.getWithdrawableAmount()).to.be.equal(amt);
        });

        it("Total vested amount should be 0", async function () {
            const amt = await vesting.getTotalVestingAmount();
            expect(amt).to.be.equal(0);
        });
    });

    describe("Adding schedules", function () {  
        it("Should not be able to create schedule for more than 1000 tokens", async function () {
            const amountToMuch = 1001;
            await expect(
                vesting.createVestingSchedule(addr1.address, 0, 0, 100, 1, false, amountToMuch
            )).to.be.revertedWith("Not enough funds");      
        });

        it("Owner creates new vesting schedule for addr1. There should be only one schedule in total", async function () {

            const sOneDay = 60 * 60 * 24;
            const dMarch1st = new Date(2022, 2, 1, 0, 0, 0, 0);

            const startTime = dMarch1st.getTime()/1000;
            const cliff = sOneDay * 60; // 60 days
            const duration = sOneDay * 360; //One year(..almost)
            const slicePeriodSeconds = sOneDay * 30; // 30 days
            const revokable = false;
            const amount = 120;

            // create new vesting schedule
            await vesting.createVestingSchedule(
                addr1.address,
                startTime,
                cliff,
                duration,
                slicePeriodSeconds,
                revokable,
                amount
            );

            //Print the schedule
            prt("-".repeat(30));
            prt("New schedule using cliff");
            prt("-".repeat(30));
            prt("beneficiary", addr1.address);
            prt("amount", amount);
            prt("startTime", dMarch1st.toLocaleString());
            prt("duration", duration / sOneDay + " days");
            prt("slicePeriod", slicePeriodSeconds / sOneDay + " days");
            prt("cliff", cliff / sOneDay + " days");
            prt("-".repeat(30));


            //There should be only one schedule
            expect(await vesting.getScheduleCount()).to.be.equal(1);
            expect(await vesting.getScheduleCountHolder(addr1.address)).to.be.equal(1);

        });

        it("Should not be able to create a schedule for more than 880 tokens", async function () {
            // Since testToken.balanceOf(vesting) = 1000
            // but vesting.getWithdrawableAmount() should be = 880 (1000-120)
            // => should not be able to create a schedule with 881 or more
            const amt = 881;
            await expect(
                    vesting.createVestingSchedule(addr1.address, 0, 0, 10, 1, false, amt)
                ).to.be.revertedWith("Not enough funds");
        });

        it("Withdrawable amount should be 880 tokens", async function () {
            expect(await vesting.getWithdrawableAmount()).to.be.equal(880)
        });

        it("Validate schedule for addr1 mocking several dates", async function () {
            const dMarch1st = new Date(2022, 2, 1, 0, 0, 0, 0);

            // compute vesting schedule id
            const vestingScheduleId = await vesting.computeScheduleId(addr1.address, 0);

            let amt;
            let newCurDate;
            prt("-".repeat(30));

            //For 3/1/2022
            newCurDate = new Date(dMarch1st);
            await vesting.setCurrentTime(newCurDate.getTime()/1000);
            amt = await vesting.computeReleasableAmount(vestingScheduleId);
            prt("current date set to: " + newCurDate.toLocaleString() + " Releasable amount: " + amt.toNumber());
            expect(amt).to.be.equal(0);

            //For 3/1/2022 + 30
            newCurDate = new Date(dMarch1st);
            newCurDate.setDate(dMarch1st.getDate() + 30 ) ;// add 30 days
            await vesting.setCurrentTime(newCurDate.getTime()/1000);
            amt = await vesting.computeReleasableAmount(vestingScheduleId);
            prt("current date set to: " + newCurDate.toLocaleString() + " Releasable amount: " + amt.toNumber());
            expect(amt).to.be.equal(0);

            //For 3/1/2022 + 60
            newCurDate = new Date(dMarch1st);
            newCurDate.setDate(dMarch1st.getDate() + 60 ) ;// add 60 days
            await vesting.setCurrentTime(newCurDate.getTime()/1000);
            amt = await vesting.computeReleasableAmount(vestingScheduleId);
            prt("current date set to: " + newCurDate.toLocaleString() + " Releasable amount: " + amt.toNumber());
            expect(amt).to.be.equal(20);

            //For 3/1/2022 + 90
            newCurDate = new Date(dMarch1st);
            newCurDate.setDate(dMarch1st.getDate() + 90 ) ;// add 90 days
            await vesting.setCurrentTime(newCurDate.getTime()/1000);
            amt = await vesting.computeReleasableAmount(vestingScheduleId);
            prt("current date set to: " + newCurDate.toLocaleString() + " Releasable amount: " + amt.toNumber());
            expect(amt).to.be.equal(30);

            prt("-".repeat(30));
        });
    });

    describe("Complex Vesting ", function () {
        it("Send all owner's balance to vesting. Should be 1000000", async function () {
        const ownerBalance = await testToken.balanceOf(owner.address);
        testToken.transfer(vesting.address, ownerBalance);

        expect(await testToken.balanceOf(owner.address)).to.equal(0);
        expect(await testToken.balanceOf(vesting.address)).to.equal(1000000);

        });

        it("Create a non-revocable schedule to addr2 of 100k, over a 5 year period, sliced every 3.5 days. Starts on March 1st", async function () {

        const oneDay = 60 * 60 * 24;
        const dMarch1st = new Date(2022, 2, 1, 0, 0, 0, 0);
        const amt = 100000;

        // create new vesting schedule
        await vesting.createVestingSchedule(
            addr2.address, //beneficiary
            dMarch1st.getTime()/1000, //start time
            0, //cliff
            oneDay * 365 * 5, // duration: five years
            oneDay * 3.5, //slicePeriodSeconds 3.5 days
            true, // revokable
            amt //amount
        );

        expect(await vesting.getScheduleCountHolder(addr2.address)).to.be.equal(1);

        //Print the schedule
        prt("-".repeat(30));
        prt("New schedule for addr2");
        prt("-".repeat(30));
        prt("beneficiary", addr2.address);
        prt("amount", amt);
        prt("startTime", dMarch1st.toLocaleString());
        prt("duration", 365 * 5 + " days");
        prt("slicePeriod", 3.5 + " days");
        prt("cliff", 0 + " days");
        prt("-".repeat(30));
    });
    
    it("Using addr2 (not contract owner). Check computeReleasableAmount for several dates", async function () {
        //get the schedule 
        const vestingScheduleId =
            await vesting.connect(addr2).computeScheduleId(addr2.address, 0);

        let amt;
        let newCurDate;
        const msOneDay = 1000 * 60 * 60 * 24;
        const dMarch1st = new Date(2022, 2, 1, 0, 0, 0, 0);

        prt("-".repeat(30));

        //Change current time and check releasable amount
        newCurDate = new Date(dMarch1st);
        await vesting.setCurrentTime(newCurDate.getTime()/1000);
        amt = await vesting.connect(addr2).computeReleasableAmount(vestingScheduleId);
        prt("current date set to March 1st: " + newCurDate.toLocaleString() + " Releasable amount: ", amt.toNumber());
        expect(amt).to.be.equal(0);

        newCurDate = new Date(dMarch1st);
        newCurDate.setTime(newCurDate.getTime() + msOneDay * 3.5);
        await vesting.setCurrentTime(newCurDate.getTime()/1000);
        amt = await vesting.connect(addr2).computeReleasableAmount(vestingScheduleId);
        prt("current date set to March 1st + 3.5d: " + newCurDate.toLocaleString() + " Releasable amount: " + amt.toNumber());
        expect(amt).to.be.equal(191);

        newCurDate = new Date(dMarch1st);
        newCurDate.setTime(newCurDate.getTime() + msOneDay * 6.99);
        await vesting.setCurrentTime(newCurDate.getTime()/1000);
        amt = await vesting.connect(addr2).computeReleasableAmount(vestingScheduleId);
        prt("current date set to March 1st + 6.99d: " + newCurDate.toLocaleString() + " Releasable amount: " + amt.toNumber());
        expect(amt).to.be.equal(191);

        newCurDate = new Date(dMarch1st);
        newCurDate.setTime(newCurDate.getTime() + msOneDay * 7);
        await vesting.setCurrentTime(newCurDate.getTime()/1000);
        amt = await vesting.connect(addr2).computeReleasableAmount(vestingScheduleId);
        prt("current date set to March 1st + 7d: " + newCurDate.toLocaleString() + ": Releasable amount: " + amt.toNumber());
        expect(amt).to.be.equal(383);

        newCurDate = new Date(dMarch1st);
        newCurDate.setTime(newCurDate.getTime() + msOneDay * 35);
        await vesting.setCurrentTime(newCurDate.getTime()/1000);
        amt = await vesting.connect(addr2).computeReleasableAmount(vestingScheduleId);
        prt("current date set to March 1st + 35d: " + newCurDate.toLocaleString() + " Releasable amount: " + amt.toNumber());
        expect(amt).to.be.equal(1917);

        newCurDate = new Date(dMarch1st);
        newCurDate.setTime(newCurDate.getTime() + msOneDay * 365*2.5);
        await vesting.setCurrentTime(newCurDate.getTime()/1000);
        amt = await vesting.connect(addr2).computeReleasableAmount(vestingScheduleId);
        prt("current date set to March 1st + 912.5d: " + newCurDate.toLocaleString() + " Releasable amount: " + amt.toNumber());
        expect(amt).to.be.equal(49863);

        newCurDate = new Date(dMarch1st);
        newCurDate.setTime(newCurDate.getTime() + msOneDay * 365*5);
        await vesting.setCurrentTime(newCurDate.getTime()/1000);
        amt = await vesting.connect(addr2).computeReleasableAmount(vestingScheduleId);
        prt("current date set to March 1st + 1825d: " + newCurDate.toLocaleString() + " Releasable amount: " + amt.toNumber());
        expect(amt).to.be.equal(100000);

        newCurDate = new Date(dMarch1st);
        newCurDate.setTime(newCurDate.getTime() + msOneDay * 364);
        await vesting.setCurrentTime(newCurDate.getTime()/1000);
        amt = await vesting.connect(addr2).computeReleasableAmount(vestingScheduleId);
        prt("current date set to March 1st + 364d: " + newCurDate.toLocaleString() + " Releasable amount: " + amt.toNumber());
        expect(amt).to.be.equal(19945);

        newCurDate = new Date(dMarch1st);
        newCurDate.setTime(newCurDate.getTime() + msOneDay * 365);
        await vesting.setCurrentTime(newCurDate.getTime()/1000);
        amt = await vesting.connect(addr2).computeReleasableAmount(vestingScheduleId);
        prt("current date set to March 1st + 365d: " + newCurDate.toLocaleString() + " Releasable amount: " + amt.toNumber());
        expect(amt).to.be.equal(19945);      

        prt("-".repeat(30));      
        
    });

    it("Create a second schedule to addr2 of 300k, over a 10 year period, sliced every 365 days. Starts on March 1st", async function () {

        const oneDay = 60 * 60 * 24;
        const dMarch1st = new Date(2022, 2, 1, 0, 0, 0, 0);
        const amt = 300000;

        // create new vesting schedule
        await vesting.createVestingSchedule(
            addr2.address, //beneficiary
            dMarch1st.getTime()/1000, //start time
            0, //cliff
            oneDay * 365 * 10, // duration: 10 years
            oneDay * 365, //slicePeriodSeconds 1 year
            false, // revokable
            amt //amount
        );

        expect(await vesting.getScheduleCountHolder(addr2.address)).to.be.equal(2);

        //Print the schedule
        prt("-".repeat(30));
        prt("New schedule for addr2");
        prt("-".repeat(30));
        prt("beneficiary: " +  addr2.address);
        prt("amount: " + amt);
        prt("startTime: " + dMarch1st.toLocaleString());
        prt("duration: " + 365 * 10 + " days");
        prt("slicePeriod: " + 365 + " days");
        prt("cliff: " + 0 + " days");
        prt("-".repeat(30));
    });

    it("Compute ALL releasable amount for addr2", async function () {
        let amt;
        let newCurDate;
        const msOneDay = 1000 * 60 * 60 * 24;
        const dMarch1st = new Date(2022, 2, 1, 0, 0, 0, 0);

        prt("-".repeat(30));

        //Change current time and check releasable amount
        newCurDate = new Date(dMarch1st);
        newCurDate.setTime(newCurDate.getTime() + msOneDay * 364);
        await vesting.setCurrentTime(newCurDate.getTime()/1000);
        amt = await vesting.connect(addr2).computeAmountForAllMySchedules();
        prt("current date set to March 1st + 364d: " + newCurDate.toLocaleString() + " Releasable amount: " + amt.toNumber());
        expect(amt).to.be.equal(19945);

        //Change current time and check releasable amount
        newCurDate = new Date(dMarch1st);
        newCurDate.setTime(newCurDate.getTime() + msOneDay * 365);
        await vesting.setCurrentTime(newCurDate.getTime()/1000);
        amt = await vesting.connect(addr2).computeAmountForAllMySchedules();
        prt("current date set to March 1st + 365d: " + newCurDate.toLocaleString() + " Releasable amount: ", amt.toNumber());
        expect(amt).to.be.equal(49945);

        prt("-".repeat(30));
    });
    
    it("Release ALL releasable amount for addr2 on March 1st + 7 days", async function () {
        let amt;
        let newCurDate;
        const msOneDay = 1000 * 60 * 60 * 24;
        const dMarch1st = new Date(2022, 2, 1, 0, 0, 0, 0);

        //Change current time and check releasable amount
        newCurDate = new Date(dMarch1st);
        newCurDate.setTime(newCurDate.getTime() + msOneDay * 7);
        await vesting.setCurrentTime(newCurDate.getTime()/1000);
        amt = await vesting.connect(addr2).computeAmountForAllMySchedules();
        prt("current date set to March 1st + 7: " + newCurDate.toLocaleString() + " Releasable amount: " + amt.toNumber());

        prt("Balance of addr2: " + (await testToken.balanceOf(addr2.address)).toNumber());
        prt("Balance of vesting: " +  (await testToken.balanceOf(vesting.address)).toNumber());
        
        //store pre-release balanace
        const prevBalAddr2 = await testToken.balanceOf(addr2.address);
        const prevBalVensting = await testToken.balanceOf(vesting.address);

        //release tokens 
        const scheduleIndex = 0; // use the first schedule
        const scheduleId = await vesting.computeScheduleId(addr2.address, scheduleIndex);
        
        // This would not work because of how this event is/are emited
        // await expect(vesting.connect(addr2).releaseAllMySchedules())
        //     .to.emit(vesting, "Released").withArgs(scheduleId, 383, addr2.address);
        
        // Use this instead
        const trx = await vesting.connect(addr2).releaseAllMySchedules();
        const receipt = await trx.wait();
        expect(receipt.events[1].args.scheduleId).to.be.equal(scheduleId);
        expect(receipt.events[1].args.amount).to.be.equal(383);
        expect(receipt.events[1].args.holder).to.be.equal(addr2.address);


        prt("Balance of addr2 after release: " + (await testToken.balanceOf(addr2.address)).toNumber());
        prt("Balance of vesting after release: " + (await testToken.balanceOf(vesting.address)).toNumber());

        expect(await testToken.balanceOf(addr2.address)).to.be.equal(prevBalAddr2.add(amt));
        expect(await testToken.balanceOf(vesting.address)).to.be.equal(prevBalVensting.sub(amt));
      
    });

    it("Release ALL releasable amount for addr2 on March 1st + 365 days", async function () {
        let amt;
        let newCurDate;
        const msOneDay = 1000 * 60 * 60 * 24;
        const dMarch1st = new Date(2022, 2, 1, 0, 0, 0, 0);

        //Change current time and check releasable amount
        newCurDate = new Date(dMarch1st);
        newCurDate.setTime(newCurDate.getTime() + msOneDay * 365);
        await vesting.setCurrentTime(newCurDate.getTime()/1000);
        amt = await vesting.connect(addr2).computeAmountForAllMySchedules();
        prt("current date set to March 1st + 365: " + newCurDate.toLocaleString() + " Releasable amount: " + amt.toNumber());      

        prt("Balance of addr2: " + (await testToken.balanceOf(addr2.address)).toNumber());
        prt("Balance of vesting: " + (await testToken.balanceOf(vesting.address)).toNumber());

        //store pre-release balanace
        const prevBalAddr2 = await testToken.balanceOf(addr2.address);
        const prevBalVensting = await testToken.balanceOf(vesting.address);
        
        //release tokens 
        const trx = await vesting.connect(addr2).releaseAllMySchedules();
        const receipt = await trx.wait();
        const scheduleId0 = await vesting.computeScheduleId(addr2.address, 0);
        const scheduleId1 = await vesting.computeScheduleId(addr2.address, 1);

        // Check the events for the 2 schedules released
        expect(receipt.events[1].args.scheduleId).to.be.equal(scheduleId0);
        expect(receipt.events[1].args.amount).to.be.equal(19562);
        expect(receipt.events[1].args.holder).to.be.equal(addr2.address);

        expect(receipt.events[3].args.scheduleId).to.be.equal(scheduleId1);
        expect(receipt.events[3].args.amount).to.be.equal(30000);
        expect(receipt.events[3].args.holder).to.be.equal(addr2.address);


        prt("Balance of addr2 after release: " + (await testToken.balanceOf(addr2.address)).toNumber());
        prt("Balance of vesting after release: " + (await testToken.balanceOf(vesting.address)).toNumber());

        expect(await testToken.balanceOf(addr2.address)).to.be.equal(prevBalAddr2.add(amt));
        expect(await testToken.balanceOf(vesting.address)).to.be.equal(prevBalVensting.sub(amt));
    });

    it("Release ALL releasable amount for addr2 on March 1st + 731 days, but revoking one of the schedules.", async function () {
        let amt;
        let newCurDate;
        const msOneDay = 1000 * 60 * 60 * 24;
        const dMarch1st = new Date(2022, 2, 1, 0, 0, 0, 0);

        //Change current time and check releasable amount
        newCurDate = new Date(dMarch1st);
        newCurDate.setTime(newCurDate.getTime() + msOneDay * 731);
        await vesting.setCurrentTime(newCurDate.getTime()/1000);
        amt = await vesting.connect(addr2).computeAmountForAllMySchedules();
        prt("current date set to March 1st + 731: " + newCurDate.toLocaleString() + " Releasable amount: " + amt.toNumber());      

        prt("Balance of addr2: " + (await testToken.balanceOf(addr2.address)).toNumber());
        prt("Balance of vesting: " + (await testToken.balanceOf(vesting.address)).toNumber());

        //store pre-release balanace
        const prevBalAddr2 = await testToken.balanceOf(addr2.address);
        const prevBalVensting = await testToken.balanceOf(vesting.address);
        
        //revoke one of the schedules
        const revokeScheduleId = await vesting.connect(addr2).computeScheduleId(addr2.address, 0);
        const trx = await vesting.revoke(revokeScheduleId);
        const receipt = await trx.wait();

        // Revoke event is the 3rd element
        expect(receipt.events[2].args.scheduleId).to.be.equal(revokeScheduleId);
        expect(receipt.events[2].args.revokedAmount).to.be.equal(60110);
        expect(receipt.events[2].args.holder).to.be.equal(addr2.address);


        prt("Balance of addr2 after revoke: " + (await testToken.balanceOf(addr2.address)).toNumber());
        prt("Balance of vesting after revoke: " + (await testToken.balanceOf(vesting.address)).toNumber());
        
        //release tokens 
        await vesting.connect(addr2).releaseAllMySchedules();

        prt("Balance of addr2 after release: " + (await testToken.balanceOf(addr2.address)).toNumber());
        prt("Balance of vesting after release: " + (await testToken.balanceOf(vesting.address)).toNumber());
        
        expect(await testToken.balanceOf(addr2.address)).to.be.equal(prevBalAddr2.add(amt));
        expect(await testToken.balanceOf(vesting.address)).to.be.equal(prevBalVensting.sub(amt));
    });

    it("Release ALL releasable amount for addr2 on March 1st + 1120 days, with one of the schedules revoked.", async function () {
        let amt;
        let newCurDate;
        const msOneDay = 1000 * 60 * 60 * 24;
        const dMarch1st = new Date(2022, 2, 1, 0, 0, 0, 0);

        //Change current time and check releasable amount
        newCurDate = new Date(dMarch1st);
        newCurDate.setTime(newCurDate.getTime() + msOneDay * 1120);
        await vesting.setCurrentTime(newCurDate.getTime()/1000);
        amt = await vesting.connect(addr2).computeAmountForAllMySchedules();
        prt("current date set to March 1st + 1120: " + newCurDate.toLocaleString() + " Releasable amount:" + amt.toNumber());      

        prt("Balance of addr2: " + (await testToken.balanceOf(addr2.address)).toNumber());
        prt("Balance of vesting: " + (await testToken.balanceOf(vesting.address)).toNumber());

        //store pre-release balanace
        const prevBalAddr2 = await testToken.balanceOf(addr2.address);
        const prevBalVensting = await testToken.balanceOf(vesting.address);
        
        //release tokens 
        await vesting.connect(addr2).releaseAllMySchedules();

        prt("Balance of addr2 after release: " + (await testToken.balanceOf(addr2.address)).toNumber());
        prt("Balance of vesting after release:" + (await testToken.balanceOf(vesting.address)).toNumber());
        
        expect(await testToken.balanceOf(addr2.address)).to.be.equal(prevBalAddr2.add(amt));
        expect(await testToken.balanceOf(vesting.address)).to.be.equal(prevBalVensting.sub(amt));
    });

  });
});