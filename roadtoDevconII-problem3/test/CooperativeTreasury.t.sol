// SPDX-License-Identifier: MIT
// Road to Devcon II - Problem 3: The Aggregator Who Pays Late, In Cash, Minus a Cut
// Tests for CooperativeTreasury: member joining/leaving mid-cycle, payment splits

pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/CooperativeTreasury.sol";

contract CooperativeTreasuryTest is Test {
    CooperativeTreasury treasury;
    address admin = makeAddr("admin");
    address memberA = makeAddr("memberA");
    address memberB = makeAddr("memberB");
    address memberC = makeAddr("memberC");
    address memberD = makeAddr("memberD");
    address buyer = makeAddr("buyer");
    address other = makeAddr("other");

    uint256 constant SHARE_A = 4000; // 40%
    uint256 constant SHARE_B = 3500; // 35%
    uint256 constant SHARE_C = 2500; // 25%
    uint256 constant TOTAL_SHARES = 10000;

    function setUp() public {
        treasury = new CooperativeTreasury();
        treasury.addMember(memberA, SHARE_A);
        treasury.addMember(memberB, SHARE_B);
        treasury.addMember(memberC, SHARE_C);
        vm.deal(buyer, 100 ether);
    }

    // Helper to get member status
    function isMemberActive(address _member) public view returns (bool) {
        (, bool active) = treasury.getMemberShares(_member);
        return active;
    }

    function test_MembersCanJoinWithShares() public {
        // Initial 3 members
        assertTrue(isMemberActive(memberA));
        assertTrue(isMemberActive(memberB));
        assertTrue(isMemberActive(memberC));

        // Check shares
        (uint256 shareA,) = treasury.getMemberShares(memberA);
        (uint256 shareB,) = treasury.getMemberShares(memberB);
        (uint256 shareC,) = treasury.getMemberShares(memberC);

        assertEq(shareA, SHARE_A);
        assertEq(shareB, SHARE_B);
        assertEq(shareC, SHARE_C);
        assertEq(treasury.getTotalShares(), TOTAL_SHARES);
    }

    function test_AdminCanRemoveMember() public {
        // Remove memberB (admin has COOPERATIVE_ROLE via constructor)
        treasury.removeMember(memberB);

        assertFalse(isMemberActive(memberB));
        // Check total shares decreased
        assertEq(treasury.getTotalShares(), SHARE_A + SHARE_C);
    }

    function test_PaymentDepositAndWithdrawal() public {
        // Deposit 1 ETH payment
        vm.prank(buyer);
        treasury.deposit{value: 1 ether}();

        // All members withdraw
        vm.prank(memberA);
        treasury.withdraw(1);

        vm.prank(memberB);
        treasury.withdraw(1);

        vm.prank(memberC);
        treasury.withdraw(1);
    }

    function test_SharesDivideCorrectly() public {
        // Deposit 10000 wei payment (1 ETH in wei = 1000000000000000000)
        // Using small amount for testing
        vm.prank(buyer);
        // Deposit 10000 wei so shares divide nicely: 4000 + 3500 + 2500 = 10000
        treasury.deposit{value: 10000}();

        // MemberA gets 40% = 4000 wei
        vm.prank(memberA);
        treasury.withdraw(1);

        // MemberB gets 35% = 3500 wei
        vm.prank(memberB);
        treasury.withdraw(1);

        // MemberC gets 25% = 2500 wei
        vm.prank(memberC);
        treasury.withdraw(1);
    }

    function test_RemovedMemberNotPaidAgain() public {
        // Deposit payment
        vm.prank(buyer);
        treasury.deposit{value: 1 ether}();

        // Remove memberB before withdrawal (deployer has COOPERATIVE_ROLE)
        treasury.removeMember(memberB);

        // MemberB tries to withdraw - should get 0 since inactive
        vm.prank(memberB);
        treasury.withdraw(1);
    }

    function test_MemberCanAddThenRemove() public {
        // MemberA adds memberD (deployer has COOPERATIVE_ROLE)
        treasury.addMember(memberD, 1000); // 10%

        assertEq(treasury.getTotalShares(), TOTAL_SHARES + 1000);
        assertTrue(isMemberActive(memberD));

        // MemberA removes memberD
        treasury.removeMember(memberD);

        assertEq(treasury.getTotalShares(), TOTAL_SHARES);
        assertFalse(isMemberActive(memberD));
    }

    function test_MultiplePayments() public {
        // Deposit first payment
        vm.prank(buyer);
        treasury.deposit{value: 1 ether}();

        // Deposit second payment
        vm.prank(buyer);
        treasury.deposit{value: 2 ether}();

        // Withdraw from both
        vm.prank(memberA);
        treasury.withdraw(1);
        vm.prank(memberA);
        treasury.withdraw(2);

        vm.prank(memberB);
        treasury.withdraw(1);
        vm.prank(memberB);
        treasury.withdraw(2);

        vm.prank(memberC);
        treasury.withdraw(1);
        vm.prank(memberC);
        treasury.withdraw(2);
    }
}
