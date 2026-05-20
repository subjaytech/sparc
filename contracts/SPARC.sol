// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title SPARC
 * @notice Competitive onchain jigsaw puzzle game on Arc Network
 * @dev UUPS upgradeable — proxy address is permanent, logic is upgradeable
 *
 * Security features:
 *  - UUPS proxy (permanent address, upgradeable logic)
 *  - ReentrancyGuard (inline, no OZ dependency)
 *  - Pull payment pattern (winner withdraws, no push-DoS)
 *  - ECDSA signature verification with low-s malleability protection
 *  - Signature replay prevention (per-hash tracking)
 *  - Two-step ownership transfer
 *  - Global pause mechanism
 *  - Locked funds accounting (active pots + refunds + pending withdrawals)
 *  - Refund logic for zero-finisher rounds
 *  - Bounded admin parameter updates
 *  - Storage gap for safe future upgrades
 */

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract SPARC is Initializable, UUPSUpgradeable {

    // =========================================================================
    //  CONSTANTS
    // =========================================================================

    string  public constant VERSION       = "1.0.0";
    address public constant USDC          = 0x3600000000000000000000000000000000000000;
    uint256 public constant MAX_FEE_BPS   = 500;        // 5% maximum platform fee cap
    uint256 public constant MAX_EXPIRY    = 15 minutes; // Maximum backend sig validity
    uint256 public constant CLOCK_BUFFER  = 60;         // 60s clock skew tolerance

    // secp256k1 curve order / 2 — low-s ECDSA malleability protection
    bytes32 private constant _S_BOUND =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    // Reentrancy guard
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED     = 2;

    // =========================================================================
    //  STATE — DO NOT REORDER (proxy storage layout)
    // =========================================================================

    // --- Access control ---
    address public owner;
    address public pendingOwner;
    address public trustedSigner;
    bool    public paused;

    // --- Reentrancy ---
    uint256 private _status;

    // --- Game parameters (owner-adjustable within bounds) ---
    uint256 public roundDuration;   // Default: 6 hours
    uint256 public platformFeeBps;  // Default: 30 (0.30%)
    uint256[5] public entryFees;

    // --- Global fund accounting ---
    uint256 public totalRefundable;
    uint256 public totalPendingWithdrawals;

    // --- Pull payment balances ---
    mapping(address => uint256) public pendingWithdrawals;

    // --- Pool state ---
    struct Finisher {
        address player;
        uint256 completedAt;
    }

    struct Pool {
        uint256      roundId;
        uint256      totalPot;
        uint256      roundStartTime;
        uint256      roundEndTime;
        bool         roundActive;
        uint256      finisherCount;
        Finisher[3]  topThree;
    }

    mapping(uint256 => Pool) public pools;

    // poolId => roundId => player => bool
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) private _hasJoined;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) private _hasCompleted;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) private _hasRefunded;

    // Refund tracking
    mapping(uint256 => mapping(uint256 => bool))    public isRefundRound;
    mapping(uint256 => mapping(uint256 => uint256)) public refundablePot;

    // Signature replay prevention
    mapping(bytes32 => bool) private _usedSignatures;

    // Storage gap — reserve 50 slots for future upgrades without layout collision
    uint256[50] private __gap;

    // =========================================================================
    //  EVENTS
    // =========================================================================

    event RoundStarted(uint256 indexed poolId, uint256 roundId, uint256 endTime);
    event PlayerJoined(uint256 indexed poolId, address indexed player, uint256 totalPot);
    event PuzzleCompleted(uint256 indexed poolId, address indexed player, uint256 rank);
    event RoundFinalized(uint256 indexed poolId, uint256 roundId, uint256 totalPot, bool refundable);
    event WinningsAllocated(uint256 indexed poolId, address indexed player, uint256 amount, uint256 rank);
    event WinningsWithdrawn(address indexed player, uint256 amount);
    event RefundClaimed(uint256 indexed poolId, uint256 roundId, address indexed player, uint256 amount);
    event RoundAborted(uint256 indexed poolId, uint256 roundId);
    event OwnershipProposed(address indexed proposed);
    event OwnershipAccepted(address indexed newOwner);
    event SignerUpdated(address indexed oldSigner, address indexed newSigner);
    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    event RoundDurationUpdated(uint256 oldDuration, uint256 newDuration);
    event EntryFeeUpdated(uint256 indexed poolId, uint256 oldFee, uint256 newFee);
    event EmergencyWithdraw(address indexed to, uint256 amount);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // =========================================================================
    //  MODIFIERS
    // =========================================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "SPARC: not owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "SPARC: paused");
        _;
    }

    modifier validPool(uint256 poolId) {
        require(poolId < 5, "SPARC: invalid pool");
        _;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "SPARC: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    // =========================================================================
    //  INITIALIZER (replaces constructor for proxy)
    // =========================================================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract — called once on proxy deployment
     * @dev Replaces constructor for upgradeable pattern
     */
   function initialize(address _owner, address _signer) public initializer {
    __UUPSUpgradeable_init();
        require(_owner  != address(0), "SPARC: zero owner");
        require(_signer != address(0), "SPARC: zero signer");

        owner         = _owner;
        trustedSigner = _signer;
        _status       = _NOT_ENTERED;
        roundDuration = 6 hours;
        platformFeeBps = 30;

        entryFees[0] = 500_000;        // $0.50
        entryFees[1] = 5_000_000;      // $5
        entryFees[2] = 50_000_000;     // $50
        entryFees[3] = 500_000_000;    // $500
        entryFees[4] = 5_000_000_000;  // $5,000
    }

    // =========================================================================
    //  UUPS — UPGRADE AUTHORIZATION
    // =========================================================================

    /**
     * @dev Only owner can authorize a contract upgrade
     */
    function _authorizeUpgrade(address newImplementation)
        internal override onlyOwner {}

    // =========================================================================
    //  OWNER — ACCESS CONTROL
    // =========================================================================

    function proposeOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "SPARC: zero address");
        pendingOwner = newOwner;
        emit OwnershipProposed(newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "SPARC: not pending owner");
        emit OwnershipAccepted(pendingOwner);
        owner        = pendingOwner;
        pendingOwner = address(0);
    }

    function setTrustedSigner(address _signer) external onlyOwner {
        require(_signer != address(0), "SPARC: zero address");
        emit SignerUpdated(trustedSigner, _signer);
        trustedSigner = _signer;
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        if (_paused) emit Paused(msg.sender);
        else emit Unpaused(msg.sender);
    }

    // =========================================================================
    //  OWNER — PARAMETER UPDATES (bounded)
    // =========================================================================

    /**
     * @notice Update platform fee — capped at 5% to protect players
     */
    function setPlatformFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= MAX_FEE_BPS, "SPARC: fee exceeds cap");
        emit PlatformFeeUpdated(platformFeeBps, newFeeBps);
        platformFeeBps = newFeeBps;
    }

    /**
     * @notice Update round duration — between 1 hour and 24 hours
     */
    function setRoundDuration(uint256 newDuration) external onlyOwner {
        require(newDuration >= 1 hours,  "SPARC: too short");
        require(newDuration <= 24 hours, "SPARC: too long");
        emit RoundDurationUpdated(roundDuration, newDuration);
        roundDuration = newDuration;
    }

    /**
     * @notice Update entry fee for a pool — only when that pool is inactive
     * @dev Prevents changing fees mid-round
     */
    function setEntryFee(uint256 poolId, uint256 newFee)
        external onlyOwner validPool(poolId)
    {
        require(!pools[poolId].roundActive, "SPARC: round active");
        require(newFee > 0,                 "SPARC: zero fee");
        emit EntryFeeUpdated(poolId, entryFees[poolId], newFee);
        entryFees[poolId] = newFee;
    }

    // =========================================================================
    //  OWNER — ROUND MANAGEMENT
    // =========================================================================

    function startRound(uint256 poolId) external onlyOwner validPool(poolId) {
        Pool storage pool = pools[poolId];
        require(!pool.roundActive, "SPARC: round active");

        pool.roundId++;
        pool.roundStartTime = block.timestamp;
        pool.roundEndTime   = block.timestamp + roundDuration;
        pool.roundActive    = true;
        pool.totalPot       = 0;
        pool.finisherCount  = 0;

        delete pool.topThree[0];
        delete pool.topThree[1];
        delete pool.topThree[2];

        emit RoundStarted(poolId, pool.roundId, pool.roundEndTime);
    }

    /**
     * @notice Abort a round mid-session and enable full refunds
     * @dev Use when exploit or bug is detected during an active round
     */
    function abortRound(uint256 poolId) external onlyOwner validPool(poolId) {
        Pool storage pool = pools[poolId];
        require(pool.roundActive, "SPARC: no active round");

        pool.roundActive = false;
        uint256 rid      = pool.roundId;

        if (pool.totalPot > 0) {
            isRefundRound[poolId][rid]  = true;
            refundablePot[poolId][rid]  = pool.totalPot;
            totalRefundable            += pool.totalPot;
        }

        emit RoundAborted(poolId, rid);
    }

    /**
     * @notice Withdraw only funds not locked in active rounds,
     *         pending refunds, or unclaimed winnings
     */
    function emergencyWithdraw() external onlyOwner nonReentrant {
        uint256 balance = IERC20(USDC).balanceOf(address(this));
        uint256 locked  = _lockedFunds();
        require(balance > locked, "SPARC: no unlocked funds");
        uint256 amount  = balance - locked;
        emit EmergencyWithdraw(owner, amount);
        require(IERC20(USDC).transfer(owner, amount), "SPARC: transfer failed");
    }

    // =========================================================================
    //  PLAYER — GAME ACTIONS
    // =========================================================================

    function joinPool(uint256 poolId)
        external
        validPool(poolId)
        whenNotPaused
        nonReentrant
    {
        Pool storage pool = pools[poolId];
        require(pool.roundActive,                                   "SPARC: no active round");
        require(block.timestamp < pool.roundEndTime,                "SPARC: round ended");
        require(!_hasJoined[poolId][pool.roundId][msg.sender],      "SPARC: already joined");

        uint256 fee = entryFees[poolId];
        require(
            IERC20(USDC).transferFrom(msg.sender, address(this), fee),
            "SPARC: transfer failed - approve first"
        );

        _hasJoined[poolId][pool.roundId][msg.sender] = true;
        pool.totalPot                               += fee;

        emit PlayerJoined(poolId, msg.sender, pool.totalPot);
    }

    /**
     * @notice Submit puzzle completion — requires backend cryptographic proof
     *
     * @dev Backend signs: keccak256(abi.encodePacked(player, poolId, roundId, expiry))
     *      Protections:
     *        - No valid signature without solving via the game UI
     *        - 15-minute max expiry limits front-running window
     *        - 60s clock buffer prevents valid sig rejection from skew
     *        - roundId in payload prevents cross-round replay
     *        - usedSignatures prevents same-round replay
     *        - Low-s enforcement prevents ECDSA malleability
     */
    function submitCompletion(
        uint256 poolId,
        uint256 expiry,
        bytes calldata signature
    )
        external
        validPool(poolId)
        whenNotPaused
        nonReentrant
    {
        Pool storage pool = pools[poolId];

        require(pool.roundActive,                                       "SPARC: no active round");
        require(block.timestamp <= pool.roundEndTime,                   "SPARC: round ended");
        require(_hasJoined[poolId][pool.roundId][msg.sender],           "SPARC: not joined");
        require(!_hasCompleted[poolId][pool.roundId][msg.sender],       "SPARC: already submitted");

        // Signature timing — with clock skew buffer
        require(block.timestamp <= expiry,                              "SPARC: signature expired");
        require(expiry <= block.timestamp + MAX_EXPIRY + CLOCK_BUFFER,  "SPARC: expiry too far");

        // Build signed message
        bytes32 msgHash = keccak256(
            abi.encodePacked(msg.sender, poolId, pool.roundId, expiry)
        );
        bytes32 ethHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash)
        );

        // Replay and validity checks
        require(!_usedSignatures[ethHash],                              "SPARC: signature used");
        require(
            _recoverSigner(ethHash, signature) == trustedSigner,
            "SPARC: invalid signature"
        );

        _usedSignatures[ethHash]                        = true;
        _hasCompleted[poolId][pool.roundId][msg.sender] = true;

        if (pool.finisherCount < 3) {
            pool.topThree[pool.finisherCount] = Finisher({
                player:      msg.sender,
                completedAt: block.timestamp
            });
            emit PuzzleCompleted(poolId, msg.sender, pool.finisherCount + 1);
            pool.finisherCount++;
        }
    }

    /**
     * @notice Claim refund from a zero-finisher or aborted round
     * @param poolId  Pool to claim from
     * @param roundId Specific round ID (check RefundRound events or getPoolInfo)
     */
    function claimRefund(uint256 poolId, uint256 roundId)
        external
        validPool(poolId)
        nonReentrant
    {
        require(isRefundRound[poolId][roundId],                     "SPARC: not refundable");
        require(_hasJoined[poolId][roundId][msg.sender],            "SPARC: did not join");
        require(!_hasRefunded[poolId][roundId][msg.sender],         "SPARC: already refunded");

        uint256 amount = entryFees[poolId];
        require(refundablePot[poolId][roundId] >= amount,           "SPARC: pot exhausted");

        // CEI pattern — effects before interaction
        _hasRefunded[poolId][roundId][msg.sender] = true;
        refundablePot[poolId][roundId]            -= amount;
        totalRefundable                           -= amount;

        emit RefundClaimed(poolId, roundId, msg.sender, amount);
        require(IERC20(USDC).transfer(msg.sender, amount),          "SPARC: transfer failed");
    }

    /**
     * @notice Withdraw accumulated prize winnings
     * @dev Pull pattern — isolates failed transfers to individual winners only
     */
    function withdrawWinnings() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "SPARC: nothing to withdraw");

        // CEI pattern — effects before interaction
        pendingWithdrawals[msg.sender] = 0;
        totalPendingWithdrawals       -= amount;

        emit WinningsWithdrawn(msg.sender, amount);
        require(IERC20(USDC).transfer(msg.sender, amount), "SPARC: transfer failed");
    }

    // =========================================================================
    //  FINALIZATION — PERMISSIONLESS
    // =========================================================================

    /**
     * @notice Finalize an ended round — anyone can call after roundEndTime
     * @dev Permissionless so owner can never block payouts maliciously
     */
    function finalizeRound(uint256 poolId)
        external
        validPool(poolId)
        nonReentrant
    {
        Pool storage pool = pools[poolId];
        require(pool.roundActive,                    "SPARC: no active round");
        require(block.timestamp > pool.roundEndTime, "SPARC: round ongoing");

        pool.roundActive = false;
        uint256 rid      = pool.roundId;

        // Zero finishers — enable full refunds
        if (pool.totalPot == 0 || pool.finisherCount == 0) {
            if (pool.totalPot > 0) {
                isRefundRound[poolId][rid]  = true;
                refundablePot[poolId][rid]  = pool.totalPot;
                totalRefundable            += pool.totalPot;
            }
            emit RoundFinalized(poolId, rid, pool.totalPot, true);
            return;
        }

        uint256 pot           = pool.totalPot;
        uint256 fee           = (pot * platformFeeBps) / 10_000;
        uint256 distributable = pot - fee;

        // Platform fee — owner is trusted, direct transfer is acceptable
        require(IERC20(USDC).transfer(owner, fee), "SPARC: fee transfer failed");

        uint8 count = uint8(pool.finisherCount);

        if (count == 1) {
            _allocate(pool.topThree[0].player, distributable, poolId, 1);

        } else if (count == 2) {
            uint256 first  = (distributable * 65) / 100;
            uint256 second = distributable - first;
            _allocate(pool.topThree[0].player, first,  poolId, 1);
            _allocate(pool.topThree[1].player, second, poolId, 2);

        } else {
            uint256 first  = (distributable * 50) / 100;
            uint256 second = (distributable * 30) / 100;
            uint256 third  = distributable - first - second;
            _allocate(pool.topThree[0].player, first,  poolId, 1);
            _allocate(pool.topThree[1].player, second, poolId, 2);
            _allocate(pool.topThree[2].player, third,  poolId, 3);
        }

        emit RoundFinalized(poolId, rid, pot, false);
    }

    // =========================================================================
    //  VIEW FUNCTIONS
    // =========================================================================

    function hasJoined(uint256 poolId, address player)
        external view validPool(poolId) returns (bool)
    {
        return _hasJoined[poolId][pools[poolId].roundId][player];
    }

    function hasCompleted(uint256 poolId, address player)
        external view validPool(poolId) returns (bool)
    {
        return _hasCompleted[poolId][pools[poolId].roundId][player];
    }

    function hasRefunded(uint256 poolId, uint256 roundId, address player)
        external view validPool(poolId) returns (bool)
    {
        return _hasRefunded[poolId][roundId][player];
    }

    function getTopThree(uint256 poolId)
        external view validPool(poolId)
        returns (address[3] memory players, uint256[3] memory times)
    {
        Pool storage pool = pools[poolId];
        for (uint256 i = 0; i < pool.finisherCount; i++) {
            players[i] = pool.topThree[i].player;
            times[i]   = pool.topThree[i].completedAt;
        }
    }

    function getPoolInfo(uint256 poolId)
        external view validPool(poolId)
        returns (
            uint256 entryFee,
            uint256 totalPot,
            uint256 endTime,
            bool    active,
            uint256 finisherCount,
            uint256 roundId,
            bool    refundable
        )
    {
        Pool storage pool = pools[poolId];
        return (
            entryFees[poolId],
            pool.totalPot,
            pool.roundEndTime,
            pool.roundActive,
            pool.finisherCount,
            pool.roundId,
            isRefundRound[poolId][pool.roundId]
        );
    }

    function lockedFunds() external view returns (uint256) {
        return _lockedFunds();
    }

    // =========================================================================
    //  INTERNAL
    // =========================================================================

    function _allocate(
        address player,
        uint256 amount,
        uint256 poolId,
        uint256 rank
    ) internal {
        require(player != address(0), "SPARC: zero winner");
        pendingWithdrawals[player] += amount;
        totalPendingWithdrawals    += amount;
        emit WinningsAllocated(poolId, player, amount, rank);
    }

    function _lockedFunds() internal view returns (uint256 locked) {
        locked = totalPendingWithdrawals + totalRefundable;
        for (uint256 i = 0; i < 5; i++) {
            if (pools[i].roundActive) {
                locked += pools[i].totalPot;
            }
        }
    }

    function _recoverSigner(bytes32 ethHash, bytes calldata sig)
        internal pure returns (address)
    {
        require(sig.length == 65, "SPARC: bad sig length");
        bytes32 r;
        bytes32 s;
        uint8   v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        require(uint256(s) <= uint256(_S_BOUND), "SPARC: malleable sig");
        if (v < 27) v += 27;
        require(v == 27 || v == 28,              "SPARC: bad v");
        address recovered = ecrecover(ethHash, v, r, s);
        require(recovered != address(0),         "SPARC: ecrecover failed");
        return recovered;
    }
}