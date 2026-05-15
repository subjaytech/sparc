// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

contract SPARC {

    // USDC system contract on Arc Testnet
    address public constant USDC = 0x3600000000000000000000000000000000000000;

    address public owner;

    uint256 public constant ROUND_DURATION = 6 hours;
    uint256 public constant PLATFORM_FEE_BPS = 30; // 0.3%

    // Pool entry fees in USDC (6 decimals: 1 USDC = 1_000_000)
    uint256[5] public entryFees;

    struct Finisher {
        address player;
        uint256 completedAt;
    }

    struct Pool {
        uint256 totalPot;
        uint256 roundStartTime;
        uint256 roundEndTime;
        bool roundActive;
        uint256 finisherCount;
        Finisher[3] topThree;
    }

    // poolId 0 = $0.50 | 1 = $5 | 2 = $50 | 3 = $500 | 4 = $5000
    mapping(uint256 => Pool) public pools;
    mapping(uint256 => mapping(address => bool)) public hasJoined;
    mapping(uint256 => mapping(address => bool)) public hasCompleted;

    // ---- Events ----
    event RoundStarted(uint256 indexed poolId, uint256 endTime);
    event PlayerJoined(uint256 indexed poolId, address indexed player, uint256 totalPot);
    event PuzzleCompleted(uint256 indexed poolId, address indexed player, uint256 rank);
    event RoundFinalized(uint256 indexed poolId, address first, address second, address third, uint256 totalPot);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier validPool(uint256 poolId) {
        require(poolId < 5, "Invalid pool ID");
        _;
    }

    constructor() {
        owner = msg.sender;

        // Entry fees (USDC has 6 decimals)
        entryFees[0] = 500_000;          // $0.50
        entryFees[1] = 5_000_000;        // $5
        entryFees[2] = 50_000_000;       // $50
        entryFees[3] = 500_000_000;      // $500
        entryFees[4] = 5_000_000_000;    // $5000
    }

    // -----------------------------------------------
    // OWNER: Start a round for a specific pool
    // -----------------------------------------------
    function startRound(uint256 poolId) external onlyOwner validPool(poolId) {
        Pool storage pool = pools[poolId];
        require(!pool.roundActive, "Round already active");

        pool.roundStartTime = block.timestamp;
        pool.roundEndTime   = block.timestamp + ROUND_DURATION;
        pool.roundActive    = true;
        pool.totalPot       = 0;
        pool.finisherCount  = 0;

        emit RoundStarted(poolId, pool.roundEndTime);
    }

    // -----------------------------------------------
    // PLAYER: Pay entry fee and join a pool
    // -----------------------------------------------
    function joinPool(uint256 poolId) external validPool(poolId) {
        Pool storage pool = pools[poolId];
        require(pool.roundActive, "No active round");
        require(block.timestamp < pool.roundEndTime, "Round has ended");
        require(!hasJoined[poolId][msg.sender], "Already joined this pool");

        uint256 fee = entryFees[poolId];

        require(
            IERC20(USDC).transferFrom(msg.sender, address(this), fee),
            "USDC transfer failed - approve USDC first"
        );

        hasJoined[poolId][msg.sender] = true;
        pool.totalPot += fee;

        emit PlayerJoined(poolId, msg.sender, pool.totalPot);
    }

    // -----------------------------------------------
    // PLAYER: Submit puzzle completion
    // Called by frontend when player finishes puzzle
    // -----------------------------------------------
    function submitCompletion(uint256 poolId) external validPool(poolId) {
        Pool storage pool = pools[poolId];
        require(pool.roundActive, "No active round");
        require(block.timestamp <= pool.roundEndTime, "Round has ended");
        require(hasJoined[poolId][msg.sender], "You did not join this pool");
        require(!hasCompleted[poolId][msg.sender], "Already submitted");

        hasCompleted[poolId][msg.sender] = true;

        // Record top 3 finishers only
        if (pool.finisherCount < 3) {
            pool.topThree[pool.finisherCount] = Finisher({
                player: msg.sender,
                completedAt: block.timestamp
            });
            uint256 rank = pool.finisherCount + 1;
            pool.finisherCount++;
            emit PuzzleCompleted(poolId, msg.sender, rank);
        }
    }

    // -----------------------------------------------
    // ANYONE: Finalize round after 6 hours
    // Pays out top 3 and platform fee
    // -----------------------------------------------
    function finalizeRound(uint256 poolId) external validPool(poolId) {
        Pool storage pool = pools[poolId];
        require(pool.roundActive, "No active round");
        require(block.timestamp > pool.roundEndTime, "Round still ongoing");

        pool.roundActive = false;

        uint256 pot = pool.totalPot;
        if (pot == 0 || pool.finisherCount == 0) {
            emit RoundFinalized(poolId, address(0), address(0), address(0), 0);
            return;
        }

        // Deduct 0.3% platform fee
        uint256 platformFee  = (pot * PLATFORM_FEE_BPS) / 10_000;
        uint256 distributable = pot - platformFee;

        IERC20(USDC).transfer(owner, platformFee);

        uint8 count = uint8(pool.finisherCount);

        if (count == 1) {
            // Only 1 finisher gets everything
            IERC20(USDC).transfer(pool.topThree[0].player, distributable);

        } else if (count == 2) {
            // Split 65% / 35% for 2 finishers
            uint256 first  = (distributable * 65) / 100;
            uint256 second = distributable - first;
            IERC20(USDC).transfer(pool.topThree[0].player, first);
            IERC20(USDC).transfer(pool.topThree[1].player, second);

        } else {
            // Full split: 50% / 30% / 19.7%
            uint256 first  = (distributable * 50) / 100;
            uint256 second = (distributable * 30) / 100;
            uint256 third  = distributable - first - second; // remaining = ~19.7%
            IERC20(USDC).transfer(pool.topThree[0].player, first);
            IERC20(USDC).transfer(pool.topThree[1].player, second);
            IERC20(USDC).transfer(pool.topThree[2].player, third);
        }

        emit RoundFinalized(
            poolId,
            pool.topThree[0].player,
            count > 1 ? pool.topThree[1].player : address(0),
            count > 2 ? pool.topThree[2].player : address(0),
            pot
        );
    }

    // -----------------------------------------------
    // VIEW: Get top 3 finishers for a pool
    // -----------------------------------------------
    function getTopThree(uint256 poolId)
        external
        view
        validPool(poolId)
        returns (
            address[3] memory players,
            uint256[3] memory times
        )
    {
        Pool storage pool = pools[poolId];
        for (uint256 i = 0; i < pool.finisherCount; i++) {
            players[i] = pool.topThree[i].player;
            times[i]   = pool.topThree[i].completedAt;
        }
    }

    // -----------------------------------------------
    // VIEW: Get pool info
    // -----------------------------------------------
    function getPoolInfo(uint256 poolId)
        external
        view
        validPool(poolId)
        returns (
            uint256 entryFee,
            uint256 totalPot,
            uint256 endTime,
            bool active,
            uint256 finisherCount
        )
    {
        Pool storage pool = pools[poolId];
        return (
            entryFees[poolId],
            pool.totalPot,
            pool.roundEndTime,
            pool.roundActive,
            pool.finisherCount
        );
    }

    // -----------------------------------------------
    // OWNER: Emergency withdraw (only when round inactive)
    // -----------------------------------------------
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = IERC20(USDC).balanceOf(address(this));
        require(balance > 0, "Nothing to withdraw");
        IERC20(USDC).transfer(owner, balance);
    }

    // -----------------------------------------------
    // OWNER: Transfer ownership
    // -----------------------------------------------
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
}