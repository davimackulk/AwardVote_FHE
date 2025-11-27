import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface CandidateData {
  id: string;
  name: string;
  category: string;
  score: number;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<CandidateData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [voting, setVoting] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newVoteData, setNewVoteData] = useState({ candidateName: "", category: "film", score: "" });
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateData | null>(null);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [stats, setStats] = useState({ totalVotes: 0, verifiedVotes: 0, avgScore: 0 });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const candidatesList: CandidateData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          candidatesList.push({
            id: businessId,
            name: businessData.name,
            category: businessData.description,
            score: 0,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading candidate data:', e);
        }
      }
      
      setCandidates(candidatesList);
      updateStats(candidatesList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const updateStats = (candidatesList: CandidateData[]) => {
    const totalVotes = candidatesList.length;
    const verifiedVotes = candidatesList.filter(c => c.isVerified).length;
    const avgScore = totalVotes > 0 
      ? candidatesList.reduce((sum, c) => sum + c.publicValue1, 0) / totalVotes 
      : 0;
    
    setStats({ totalVotes, verifiedVotes, avgScore });
  };

  const castVote = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setVoting(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting vote with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const scoreValue = parseInt(newVoteData.score) || 0;
      const businessId = `candidate-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, scoreValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newVoteData.candidateName,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        scoreValue,
        0,
        newVoteData.category
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Vote cast successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowVoteModal(false);
      setNewVoteData({ candidateName: "", category: "film", score: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setVoting(false); 
    }
  };

  const decryptScore = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Score already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Score decrypted and verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Score is already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
  };

  const testAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (isAvailable) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "FHE System is available and ready!" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
      }
    } catch (e) {
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Availability check failed" 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const renderStatsPanel = () => {
    return (
      <div className="stats-panels">
        <div className="stat-panel">
          <div className="stat-icon">🏆</div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalVotes}</div>
            <div className="stat-label">Total Votes</div>
          </div>
        </div>
        
        <div className="stat-panel">
          <div className="stat-icon">🔐</div>
          <div className="stat-content">
            <div className="stat-value">{stats.verifiedVotes}/{stats.totalVotes}</div>
            <div className="stat-label">Verified Scores</div>
          </div>
        </div>
        
        <div className="stat-panel">
          <div className="stat-icon">⭐</div>
          <div className="stat-content">
            <div className="stat-value">{stats.avgScore.toFixed(1)}</div>
            <div className="stat-label">Avg Score</div>
          </div>
        </div>
      </div>
    );
  };

  const renderFHEProcess = () => {
    return (
      <div className="fhe-process">
        <div className="process-step">
          <div className="step-number">1</div>
          <div className="step-info">
            <h4>Encrypt Score</h4>
            <p>Judge's score encrypted with FHE technology</p>
          </div>
        </div>
        
        <div className="process-step">
          <div className="step-number">2</div>
          <div className="step-info">
            <h4>Store on-chain</h4>
            <p>Encrypted data stored securely on blockchain</p>
          </div>
        </div>
        
        <div className="process-step">
          <div className="step-number">3</div>
          <div className="step-info">
            <h4>Homomorphic Compute</h4>
            <p>Calculate average without decryption</p>
          </div>
        </div>
        
        <div className="process-step">
          <div className="step-number">4</div>
          <div className="step-info">
            <h4>Verify Result</h4>
            <p>Decrypt and verify final score</p>
          </div>
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo-section">
            <div className="logo">🏆</div>
            <h1>Confidential Voting for Awards</h1>
          </div>
          <ConnectButton />
        </header>
        
        <div className="welcome-section">
          <div className="welcome-content">
            <h2>Secure Award Voting System</h2>
            <p>FHE-powered confidential voting with homomorphic computation</p>
            <div className="feature-grid">
              <div className="feature-item">
                <div className="feature-icon">🔒</div>
                <h3>Encrypted Scores</h3>
                <p>All votes are fully encrypted using FHE technology</p>
              </div>
              <div className="feature-item">
                <div className="feature-icon">⚡</div>
                <h3>Homomorphic Computation</h3>
                <p>Calculate averages without decrypting individual votes</p>
              </div>
              <div className="feature-item">
                <div className="feature-icon">🏅</div>
                <h3>Fair Results</h3>
                <p>Prevent vote manipulation and ensure fairness</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <h2>Initializing FHE System...</h2>
        <p>Setting up confidential voting environment</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-main">
          <div className="logo-section">
            <div className="logo">🏆</div>
            <h1>Confidential Voting for Awards</h1>
          </div>
          
          <div className="header-actions">
            <button className="test-btn" onClick={testAvailability}>
              Test FHE System
            </button>
            <button 
              className="vote-btn"
              onClick={() => setShowVoteModal(true)}
            >
              Cast Vote
            </button>
            <ConnectButton />
          </div>
        </div>
      </header>

      <main className="main-content">
        <section className="stats-section">
          <h2>Voting Statistics</h2>
          {renderStatsPanel()}
        </section>

        <section className="process-section">
          <h2>FHE Voting Process</h2>
          {renderFHEProcess()}
        </section>

        <section className="candidates-section">
          <div className="section-header">
            <h2>Candidates & Votes</h2>
            <button 
              className="refresh-btn"
              onClick={loadData}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="candidates-grid">
            {candidates.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🏆</div>
                <h3>No votes cast yet</h3>
                <p>Be the first to cast a confidential vote</p>
                <button 
                  className="vote-btn"
                  onClick={() => setShowVoteModal(true)}
                >
                  Cast First Vote
                </button>
              </div>
            ) : (
              candidates.map((candidate, index) => (
                <CandidateCard 
                  key={index}
                  candidate={candidate}
                  onSelect={setSelectedCandidate}
                  onDecrypt={decryptScore}
                />
              ))
            )}
          </div>
        </section>
      </main>

      {showVoteModal && (
        <VoteModal 
          onClose={() => setShowVoteModal(false)}
          onSubmit={castVote}
          voting={voting || isEncrypting}
          voteData={newVoteData}
          setVoteData={setNewVoteData}
        />
      )}

      {selectedCandidate && (
        <CandidateDetail 
          candidate={selectedCandidate}
          onClose={() => setSelectedCandidate(null)}
          onDecrypt={decryptScore}
        />
      )}

      {transactionStatus.visible && (
        <div className={`transaction-toast ${transactionStatus.status}`}>
          <div className="toast-content">
            <div className="toast-icon">
              {transactionStatus.status === "pending" && "⏳"}
              {transactionStatus.status === "success" && "✅"}
              {transactionStatus.status === "error" && "❌"}
            </div>
            <span>{transactionStatus.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const CandidateCard: React.FC<{
  candidate: CandidateData;
  onSelect: (candidate: CandidateData) => void;
  onDecrypt: (id: string) => Promise<number | null>;
}> = ({ candidate, onSelect, onDecrypt }) => {
  const [decrypting, setDecrypting] = useState(false);

  const handleDecrypt = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDecrypting(true);
    await onDecrypt(candidate.id);
    setDecrypting(false);
  };

  return (
    <div className="candidate-card" onClick={() => onSelect(candidate)}>
      <div className="card-header">
        <h3>{candidate.name}</h3>
        <span className="category-badge">{candidate.category}</span>
      </div>
      
      <div className="card-content">
        <div className="score-info">
          <span className="score-label">Encrypted Score</span>
          <div className="score-value">
            {candidate.isVerified ? (
              <span className="verified-score">{candidate.decryptedValue} pts</span>
            ) : (
              <span className="encrypted-score">🔒 Encrypted</span>
            )}
          </div>
        </div>
        
        <div className="meta-info">
          <span>By: {candidate.creator.substring(0, 8)}...</span>
          <span>{new Date(candidate.timestamp * 1000).toLocaleDateString()}</span>
        </div>
      </div>
      
      <div className="card-actions">
        <button 
          className={`decrypt-btn ${candidate.isVerified ? 'verified' : ''}`}
          onClick={handleDecrypt}
          disabled={decrypting}
        >
          {decrypting ? "Decrypting..." : candidate.isVerified ? "✅ Verified" : "🔓 Decrypt"}
        </button>
      </div>
    </div>
  );
};

const VoteModal: React.FC<{
  onClose: () => void;
  onSubmit: () => void;
  voting: boolean;
  voteData: any;
  setVoteData: (data: any) => void;
}> = ({ onClose, onSubmit, voting, voteData, setVoteData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setVoteData({ ...voteData, [name]: value });
  };

  return (
    <div className="modal-overlay">
      <div className="vote-modal">
        <div className="modal-header">
          <h2>Cast Confidential Vote</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="notice-icon">🔐</div>
            <p>Your vote will be encrypted using FHE technology for maximum confidentiality</p>
          </div>
          
          <div className="form-group">
            <label>Candidate Name</label>
            <input
              type="text"
              name="candidateName"
              value={voteData.candidateName}
              onChange={handleChange}
              placeholder="Enter candidate name"
            />
          </div>
          
          <div className="form-group">
            <label>Category</label>
            <select name="category" value={voteData.category} onChange={handleChange}>
              <option value="film">Film</option>
              <option value="music">Music</option>
              <option value="tv">Television</option>
              <option value="theater">Theater</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Score (1-100)</label>
            <input
              type="number"
              name="score"
              value={voteData.score}
              onChange={handleChange}
              placeholder="Enter score 1-100"
              min="1"
              max="100"
            />
            <div className="input-hint">FHE Encrypted Integer</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button 
            className="submit-btn"
            onClick={onSubmit}
            disabled={voting || !voteData.candidateName || !voteData.score}
          >
            {voting ? "Encrypting & Submitting..." : "Cast Vote"}
          </button>
        </div>
      </div>
    </div>
  );
};

const CandidateDetail: React.FC<{
  candidate: CandidateData;
  onClose: () => void;
  onDecrypt: (id: string) => Promise<number | null>;
}> = ({ candidate, onClose, onDecrypt }) => {
  const [decrypting, setDecrypting] = useState(false);

  const handleDecrypt = async () => {
    setDecrypting(true);
    await onDecrypt(candidate.id);
    setDecrypting(false);
  };

  return (
    <div className="modal-overlay">
      <div className="detail-modal">
        <div className="modal-header">
          <h2>Candidate Details</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="candidate-info">
            <div className="info-row">
              <span>Name:</span>
              <strong>{candidate.name}</strong>
            </div>
            <div className="info-row">
              <span>Category:</span>
              <span className="category-tag">{candidate.category}</span>
            </div>
            <div className="info-row">
              <span>Voted by:</span>
              <span>{candidate.creator.substring(0, 8)}...{candidate.creator.substring(38)}</span>
            </div>
            <div className="info-row">
              <span>Date:</span>
              <span>{new Date(candidate.timestamp * 1000).toLocaleString()}</span>
            </div>
          </div>
          
          <div className="score-section">
            <h3>Voting Score</h3>
            <div className="score-display">
              {candidate.isVerified ? (
                <div className="verified-score-display">
                  <div className="score-value-large">{candidate.decryptedValue}</div>
                  <div className="score-label">Final Score (Verified)</div>
                </div>
              ) : (
                <div className="encrypted-score-display">
                  <div className="encrypted-icon">🔒</div>
                  <div className="encrypted-text">Score Encrypted with FHE</div>
                </div>
              )}
            </div>
            
            <button 
              className={`decrypt-btn large ${candidate.isVerified ? 'verified' : ''}`}
              onClick={handleDecrypt}
              disabled={decrypting}
            >
              {decrypting ? "Decrypting..." : 
               candidate.isVerified ? "✅ Score Verified" : "🔓 Decrypt Score"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;