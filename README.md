# AwardVote FHE: A Confidential Voting Solution for Awards

AwardVote FHE is an innovative and privacy-preserving voting system powered by Zama's Fully Homomorphic Encryption (FHE) technology. This application enables judges to securely score candidates while ensuring that the scores remain confidential, preventing any attempts of vote tampering or manipulation. With AwardVote FHE, fairness and transparency are seamlessly integrated into the awards voting process.

## The Problem

In today's increasingly digital world, the integrity of voting systems is paramount. Traditional voting methods could expose sensitive information, allowing malicious entities to alter or influence the results through vote buying, coercion, or other fraudulent activities. Cleartext data in such scenarios poses significant risks—judges' scores could be intercepted, manipulated, or publicly disclosed, undermining the entire process. This is especially critical in high-stakes environments like awards validation, where reputation and credibility are on the line. 

## The Zama FHE Solution

Zama's Fully Homomorphic Encryption technology addresses these challenges by enabling computation on encrypted data. This means that judges can submit their scores in encrypted form, and the system can compute the average score without ever decrypting the individual scores. By leveraging the power of Zama's libraries, like fhevm, AwardVote FHE ensures that every element of the voting process remains confidential and secure. 

Using fhevm to process encrypted inputs, judges can feel confident that their votes cannot be accessed or tampered with, maintaining the sanctity of the awards process. This groundbreaking approach not only secures the votes but also enhances overall trust in the awards system.

## Key Features

- 🔒 **Confidential Scoring**: Judges can submit scores without fear of their data being exposed.
- 🤝 **Fair Evaluations**: The system guarantees that all candidates are judged impartially based on their encrypted score submissions.
- ⚖️ **Tamper-Proof Results**: The use of FHE ensures the integrity of the voting results—no one can manipulate the scores.
- 📊 **Real-Time Average Calculation**: The average scores are computed on encrypted data, providing real-time updates without compromising privacy.
- 🛡️ **Secure Data Handling**: All operations are conducted on encrypted scores, safeguarding the confidentiality of judges' assessments.

## Technical Architecture & Stack

AwardVote FHE is built on a robust technological foundation that incorporates several key components:

- **Core Privacy Engine**: Zama (fhevm)
- **Languages**: Solidity (for smart contracts), JavaScript (for the frontend), and Python (for data handling and calculations)
- **Frameworks**: Hardhat (for Ethereum development), Web3.js (for interacting with the Ethereum blockchain)

## Smart Contract / Core Logic

Here is a simplified example of how the voting logic might be structured in Solidity using Zama's FHE capabilities:

```solidity
pragma solidity ^0.8.0;

import "Zama/fhevm.sol";

contract AwardVote {
    struct Candidate {
        uint id;
        string name;
        uint encryptedScore;
    }

    mapping(uint => Candidate) public candidates;
    uint public candidatesCount;

    function submitVote(uint _candidateId, uint _encryptedScore) public {
        candidates[_candidateId].encryptedScore = TFHE.add(candidates[_candidateId].encryptedScore, _encryptedScore);
    }

    function calculateAverageScore(uint _candidateId) public view returns (uint) {
        return TFHE.decrypt(TFHE.div(candidates[_candidateId].encryptedScore, totalVotes));
    }
}
```

In this pseudo-code, we illustrate how encrypted scores can be submitted and subsequently used for real-time calculations, preserving voter confidentiality using Zama's technology.

## Directory Structure

The structure of the AwardVote FHE project is organized as follows:

```
AwardVote_FHE/
│
├── contracts/
│   ├── AwardVote.sol
│
├── scripts/
│   ├── vote_submission.js
│
├── src/
│   ├── index.js
│
├── tests/
│   ├── AwardVote.test.js
│
└── README.md
```

- `contracts/`: Contains the Solidity smart contract files.
- `scripts/`: JavaScript files for handling voting submissions and interactions.
- `src/`: Core application logic and frontend files.
- `tests/`: Test files for ensuring the functionality and security of smart contracts.

## Installation & Setup

### Prerequisites

- Ensure you have Node.js and npm installed.
- Make sure you have a compatible version of Python installed.

### Installation Steps

1. Clone the repository (local instructions).
2. Install the necessary dependencies:

   ```bash
   npm install
   pip install concrete-ml
   ```

3. Install the Zama library by running:

   ```bash
   npm install fhevm
   ```

## Build & Run

To compile your smart contracts and run the application, execute the following commands:

1. Compile the smart contracts:

   ```bash
   npx hardhat compile
   ```

2. Run the backend and frontend:

   ```bash
   node src/index.js
   ```

3. Execute the voting submission script:

   ```bash
   node scripts/vote_submission.js
   ```

## Acknowledgements

We would like to extend our gratitude to Zama for providing the open-source FHE primitives that make this project possible. Their commitment to advancing privacy through encryption technology has enabled us to create a secure and reliable voting system that prioritizes confidentiality and integrity.

---

This README outlines the essential aspects of the AwardVote FHE project, detailing its functionality, technical specifications, and how to get started. By harnessing Zama's FHE technology, we are pioneering a more secure approach to awards voting that protects both judges and candidates alike.
