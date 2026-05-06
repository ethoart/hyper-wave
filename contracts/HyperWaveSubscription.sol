// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract HyperWaveSubscription is Ownable {
    uint256 public monthlyFee = 5 * 10**6; // $5 in USDC/USDT (assuming 6 decimals on Base)
    IERC20 public acceptedToken;
    
    mapping(address => uint256) public subscriptionExpiry;

    event Subscribed(address indexed user, uint256 expiryDate);
    event FeeUpdated(uint256 newFee);

    constructor(address _acceptedToken, address initialOwner) Ownable(initialOwner) {
        acceptedToken = IERC20(_acceptedToken);
    }

    function subscribe(uint256 months) external {
        require(months > 0, "Must subscribe for at least 1 month");
        
        uint256 totalCost = monthlyFee * months;
        require(acceptedToken.transferFrom(msg.sender, address(this), totalCost), "Payment failed");

        if (subscriptionExpiry[msg.sender] < block.timestamp) {
            subscriptionExpiry[msg.sender] = block.timestamp + (months * 30 days);
        } else {
            subscriptionExpiry[msg.sender] += (months * 30 days);
        }

        emit Subscribed(msg.sender, subscriptionExpiry[msg.sender]);
    }

    function checkSubscription(address user) external view returns (bool) {
        return subscriptionExpiry[user] >= block.timestamp;
    }

    function updateFee(uint256 _newFee) external onlyOwner {
        monthlyFee = _newFee;
        emit FeeUpdated(_newFee);
    }

    function withdraw() external onlyOwner {
        uint256 balance = acceptedToken.balanceOf(address(this));
        require(acceptedToken.transfer(owner(), balance), "Withdraw failed");
    }
}
