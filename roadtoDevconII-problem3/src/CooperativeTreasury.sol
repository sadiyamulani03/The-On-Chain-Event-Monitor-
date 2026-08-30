// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CooperativeTreasury {
    bytes32 public constant COOPERATIVE_ROLE = keccak256("COOPERATIVE_ROLE");
    bytes32 public constant DEFAULT_ADMIN_ROLE = keccak256("DEFAULT_ADMIN_ROLE");

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
    mapping(bytes32 => mapping(address => bool)) public roleMembers;

    event MemberAdded(address indexed member, uint256 share, uint256 totalShares);
    event MemberRemoved(address indexed member, uint256 share, uint256 totalShares);
    event PaymentDeposited(uint256 indexed paymentId, uint256 amount, address indexed depositor);
    event PaymentSettled(uint256 indexed paymentId, uint256 totalAmount);
    event ShareWithdrawn(address indexed member, uint256 paymentId, uint256 amount);

    constructor() {
        roleMembers[DEFAULT_ADMIN_ROLE][msg.sender] = true;
        roleMembers[COOPERATIVE_ROLE][msg.sender] = true;
    }

    function addMember(address _member, uint256 _share) external {
        require(msg.sender == address(this) || roleMembers[COOPERATIVE_ROLE][msg.sender], "Only cooperative admin");
        require(_member != address(0), "Invalid member address");
        require(_share > 0 && _share <= 10000, "Share must be > 0 and <= 10000 basis points");
        require(!members[_member].active, "Member already active");
        totalShares += _share;
        members[_member] = Member({account: _member, share: _share, active: true, withdrawnFromSettled: false});
        emit MemberAdded(_member, _share, totalShares);
    }

    function removeMember(address _member) external {
        require(msg.sender == address(this) || roleMembers[COOPERATIVE_ROLE][msg.sender], "Only cooperative admin");
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

    function withdraw(uint256 _paymentId) external {
        address sender = msg.sender;
        require(_paymentId <= paymentCount, "Invalid payment ID");
        Payment storage p = payments[_paymentId];
        require(p.status == PaymentStatus.Active, "Payment not active");

        // If member is not active, they get 0
        if (!members[sender].active) {
            emit ShareWithdrawn(sender, _paymentId, 0);
            return;
        }

        uint256 memberShare = members[sender].share;
        uint256 total = totalShares;
        uint256 payAmt = p.amount;

        uint256 shareOfPayment;
        if (total > 0) {
            shareOfPayment = payAmt * memberShare / total;
        } else {
            shareOfPayment = 0;
        }

        if (shareOfPayment == 0) {
            emit ShareWithdrawn(sender, _paymentId, 0);
            return;
        }

        (bool success, ) = sender.call{value: shareOfPayment}("");
        require(success, "Transfer failed");
        emit ShareWithdrawn(sender, _paymentId, shareOfPayment);
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
