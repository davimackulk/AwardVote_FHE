pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract AwardVote_FHE is ZamaEthereumConfig {
    struct Candidate {
        string name;
        euint32 encryptedScore;
        uint256 voteCount;
        bool exists;
    }

    struct Voter {
        bool voted;
        uint256 weight;
    }

    address public chairperson;
    mapping(address => Voter) public voters;
    mapping(string => Candidate) public candidates;
    string[] public candidateNames;
    uint256 public candidateCount;

    event Voted(address indexed voter, string indexed candidateName);
    event CandidateAdded(string indexed candidateName);
    event ResultCalculated(string indexed candidateName, uint32 averageScore);

    modifier onlyChair() {
        require(msg.sender == chairperson, "Only chairperson can call this");
        _;
    }

    constructor() ZamaEthereumConfig() {
        chairperson = msg.sender;
        voters[chairperson].weight = 1;
    }

    function addCandidate(string calldata name, externalEuint32 encryptedScore, bytes calldata inputProof)
        external
        onlyChair
    {
        require(!candidates[name].exists, "Candidate already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedScore, inputProof)), "Invalid encrypted score");

        candidates[name] = Candidate({
            name: name,
            encryptedScore: FHE.fromExternal(encryptedScore, inputProof),
            voteCount: 0,
            exists: true
        });

        FHE.allowThis(candidates[name].encryptedScore);
        FHE.makePubliclyDecryptable(candidates[name].encryptedScore);

        candidateNames.push(name);
        candidateCount++;
        emit CandidateAdded(name);
    }

    function giveRightToVote(address voter) external onlyChair {
        require(!voters[voter].voted, "Voter already voted");
        require(voters[voter].weight == 0, "Voter already has voting rights");
        voters[voter].weight = 1;
    }

    function vote(string calldata candidateName) external {
        Voter storage sender = voters[msg.sender];
        require(sender.weight != 0, "Has no right to vote");
        require(!sender.voted, "Already voted");
        require(candidates[candidateName].exists, "Candidate does not exist");

        sender.voted = true;
        sender.weight = 0;

        candidates[candidateName].voteCount += 1;
        emit Voted(msg.sender, candidateName);
    }

    function calculateAverageScore(string calldata candidateName) external {
        require(candidates[candidateName].exists, "Candidate does not exist");
        require(candidates[candidateName].voteCount > 0, "No votes for candidate");

        euint32 memory totalScore = candidates[candidateName].encryptedScore;
        uint32 averageScore = FHE.decryptAsUint32(
            FHE.div(totalScore, candidates[candidateName].voteCount)
        );

        emit ResultCalculated(candidateName, averageScore);
    }

    function getCandidate(string calldata name)
        external
        view
        returns (
            string memory candidateName,
            uint256 voteCount,
            bool exists
        )
    {
        require(candidates[name].exists, "Candidate does not exist");
        return (candidates[name].name, candidates[name].voteCount, candidates[name].exists);
    }

    function getAllCandidates() external view returns (string[] memory) {
        return candidateNames;
    }

    function getEncryptedScore(string calldata candidateName) external view returns (euint32) {
        require(candidates[candidateName].exists, "Candidate does not exist");
        return candidates[candidateName].encryptedScore;
    }

    function getVoteStatus(address voter) external view returns (bool) {
        return voters[voter].voted;
    }

    function getVoterWeight(address voter) external view returns (uint256) {
        return voters[voter].weight;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}

