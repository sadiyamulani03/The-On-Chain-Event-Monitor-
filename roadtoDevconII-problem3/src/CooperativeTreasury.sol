// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title CooperativeTreasury - Warli painters shared treasury
 * Pull-payment pattern: buyer money is split per current member shares.
 * Rationale: reading shares from on-chain state (members mapping + totalShares)
 * avoids hardcoding and lets the cooperative adjust shares together.
 * Gas/safety: members withdraw themselves; contract never loops over members to push.
 * Dust: integer division remainder stays in contract balance and is sweepable by admin.
 */
contract CooperativeTreasury is AccessControl {
    bytes32 public constant COOPERATIVE_ROLE = keccak256("COOPERATIVE_ROLE");

    enum PaymentStatus { Active, Settled }

    struct Member {
        address account;
        uint256 share;
        bool active;
        bool withdrawnFromSettled;
    }

    struct Payment {
        uint256 amount;
        uint256 timestamp;
        PaymentStatus status;
        bool distributed;
    }

    mapping(address => Member) public members;
    uint256 public totalShares;
    uint256 public paymentCount;
    mapping(uint256 => Payment) public payments;
    // pull-payment bookkeeping: paymentId => member => claimed
    mapping(uint256 => mapping(address => bool)) public hasWithdrawn;

    event MemberAdded(address indexed member, uint256 share, uint256 totalShares);
    event MemberRemoved(address indexed member, uint256 share, uint256 totalShares);
    event PaymentDeposited(uint256 indexed paymentId, uint256 amount, address indexed depositor);
    event PaymentSettled(uint256 indexed paymentId, uint256 totalAmount);
    event ShareWithdrawn(address indexed member, uint256 paymentId, uint256 amount);
    event DustSwept(address indexed to, uint256 amount);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(COOPERATIVE_ROLE, msg.sender);
    }

    function addMember(address _member, uint256 _share) external onlyRole(COOPERATIVE_ROLE) {
        require(_member != address(0), "Invalid member address");
        require(_share > 0 && _share <= 10000, "Share must be > 0 and <= 10000 basis points");
        require(!members[_member].active, "Member already active");
        totalShares += _share;
        members[_member] = Member({account: _member, share: _share, active: true, withdrawnFromSettled: false});
        emit MemberAdded(_member, _share, totalShares);
    }

    function removeMember(address _member) external onlyRole(COOPERATIVE_ROLE) {
        require(_member != msg.sender, "Cannot remove yourself");
        require(members[_member].active, "Member not active");
        totalShares -= members[_member].share;
        members[_member].active = false;
        members[_member].withdrawnFromSettled = false;
        emit MemberRemoved(_member, members[_member].share, totalShares);
    }

    function deposit() external payable {
        paymentCount++;
        payments[paymentCount] = Payment({amount: msg.value, timestamp: block.timestamp, status: PaymentStatus.Active, distributed: false});
        emit PaymentDeposited(paymentCount, msg.value, msg.sender);
    }

    /**
     * @notice Pull payment: member withdraws their share for a given paymentId.
     * Reads `members[sender].share` and `totalShares` from on-chain state at withdraw time
     * (current members). Gas-efficient, no loop, reentracy-safe via checks-effects-interactions.
     * Dust from integer division stays in contract and can be swept by admin.
     * Prevents double-withdraw via hasWithdrawn.
     */
    function withdraw(uint256 _paymentId) external {
        address sender = msg.sender;
        require(_paymentId > 0 && _paymentId <= paymentCount, "Invalid payment ID");
        Payment storage p = payments[_paymentId];
        require(p.status == PaymentStatus.Active, "Payment not active");
        require(!hasWithdrawn[_paymentId][sender], "Already withdrawn");

        // If member is not active at withdraw time, they receive 0 (stops future splits)
        // and is marked as withdrawn to prevent repeated calls
        if (!members[sender].active) {
            hasWithdrawn[_paymentId][sender] = true;
            emit ShareWithdrawn(sender, _paymentId, 0);
            return;
        }

        uint256 memberShare = members[sender].share; // on-chain share
        uint256 total = totalShares;
        require(memberShare > 0, "No share");

        uint256 shareOfPayment;
        if (total > 0) {
            shareOfPayment = p.amount * memberShare / total;
        } else {
            shareOfPayment = 0;
        }

        hasWithdrawn[_paymentId][sender] = true;

        if (shareOfPayment == 0) {
            emit ShareWithdrawn(sender, _paymentId, 0);
            return;
        }

        (bool success, ) = sender.call{value: shareOfPayment}("");
        require(success, "Transfer failed");
        emit ShareWithdrawn(sender, _paymentId, shareOfPayment);
    }

    /// @notice Handle leftover dust that doesn't divide evenly (remainder stays in contract)
    function sweepDust(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "Invalid to");
        require(amount <= address(this).balance, "Insufficient balance");
        (bool s, ) = to.call{value: amount}("");
        require(s, "Sweep failed");
        emit DustSwept(to, amount);
    }

    function getMemberShares(address _member) external view returns (uint256 share, bool active) {
        Member storage m = members[_member];
        return (m.share, m.active);
    }

    function getTotalShares() external view returns (uint256) {
        return totalShares;
    }

    function getPayment(uint256 _paymentId) external view returns (uint256 amount, uint256 timestamp, PaymentStatus status, bool distributed) {
        Payment storage p = payments[_paymentId];
        return (p.amount, p.timestamp, p.status, p.distributed);
    }
}
