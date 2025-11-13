import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface CandidateData {
  id: number;
  name: string;
  category: string;
  score: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
  encryptedValueHandle?: string;
}

interface VotingStats {
  totalCandidates: number;
  totalVotes: number;
  avgScore: number;
  topCategory: string;
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
  const [newVoteData, setNewVoteData] = useState({ candidateName: "", category: "", score: "" });
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized) return;
      if (fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        console.error('Failed to initialize FHEVM:', error);
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
            id: parseInt(businessId.replace('candidate-', '')) || Date.now(),
            name: businessData.name,
            category: businessData.description,
            score: businessId,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setCandidates(candidatesList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const castVote = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setVoting(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Casting encrypted vote with Zama FHE..." });
    
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
        0,
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
      setNewVoteData({ candidateName: "", category: "", score: "" });
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

  const calculateStats = (): VotingStats => {
    const totalCandidates = candidates.length;
    const totalVotes = candidates.reduce((sum, candidate) => sum + (candidate.publicValue1 || 0), 0);
    const avgScore = totalCandidates > 0 ? totalVotes / totalCandidates : 0;
    
    const categories = candidates.reduce((acc, candidate) => {
      acc[candidate.category] = (acc[candidate.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topCategory = Object.keys(categories).reduce((a, b) => categories[a] > categories[b] ? a : b, "None");
    
    return {
      totalCandidates,
      totalVotes,
      avgScore: Number(avgScore.toFixed(1)),
      topCategory
    };
  };

  const getRankingData = () => {
    return candidates
      .filter(candidate => candidate.isVerified)
      .map(candidate => ({
        name: candidate.name,
        score: candidate.decryptedValue || 0,
        category: candidate.category
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  };

  const filteredCandidates = candidates.filter(candidate => {
    const matchesSearch = candidate.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         candidate.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === "all" || candidate.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ["all", ...Array.from(new Set(candidates.map(c => c.category)))];

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>🎭 Confidential Voting</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔐</div>
            <h2>Connect Wallet to Start Voting</h2>
            <p>Join the confidential awards voting system powered by FHE encryption</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect your wallet to access the voting system</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>FHE system will automatically initialize for encrypted voting</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Cast your votes with complete privacy protection</p>
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
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Voting System...</p>
        <p className="loading-note">Setting up confidential voting environment</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading confidential voting data...</p>
    </div>
  );

  const stats = calculateStats();
  const rankings = getRankingData();

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>🎭 Confidential Voting</h1>
          <span>FHE Protected Awards System</span>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowVoteModal(true)} 
            className="vote-btn"
          >
            🗳️ Cast Vote
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="stats-section">
          <div className="stat-card">
            <div className="stat-icon">👤</div>
            <div className="stat-info">
              <h3>{stats.totalCandidates}</h3>
              <p>Total Candidates</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🗳️</div>
            <div className="stat-info">
              <h3>{stats.totalVotes}</h3>
              <p>Total Votes Cast</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">⭐</div>
            <div className="stat-info">
              <h3>{stats.avgScore}</h3>
              <p>Average Score</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🏆</div>
            <div className="stat-info">
              <h3>{stats.topCategory}</h3>
              <p>Top Category</p>
            </div>
          </div>
        </div>

        <div className="search-section">
          <div className="search-box">
            <input 
              type="text" 
              placeholder="Search candidates or categories..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <span>🔍</span>
          </div>
          <div className="category-filters">
            {categories.map(category => (
              <button
                key={category}
                className={`category-filter ${activeCategory === category ? 'active' : ''}`}
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="content-grid">
          <div className="candidates-section">
            <div className="section-header">
              <h2>🎬 Award Candidates</h2>
              <button 
                onClick={loadData} 
                className="refresh-btn" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "🔄" : "↻"}
              </button>
            </div>
            
            <div className="candidates-grid">
              {filteredCandidates.length === 0 ? (
                <div className="no-candidates">
                  <p>No candidates found</p>
                  <button 
                    className="vote-btn" 
                    onClick={() => setShowVoteModal(true)}
                  >
                    Cast First Vote
                  </button>
                </div>
              ) : filteredCandidates.map((candidate, index) => (
                <div 
                  className={`candidate-card ${selectedCandidate?.id === candidate.id ? "selected" : ""}`} 
                  key={index}
                  onClick={() => setSelectedCandidate(candidate)}
                >
                  <div className="candidate-header">
                    <h3>{candidate.name}</h3>
                    <span className="category-badge">{candidate.category}</span>
                  </div>
                  <div className="candidate-meta">
                    <span>Votes: {candidate.publicValue1 || 0}</span>
                    <span>Added: {new Date(candidate.timestamp * 1000).toLocaleDateString()}</span>
                  </div>
                  <div className="candidate-status">
                    {candidate.isVerified ? (
                      <span className="status-verified">✅ Score: {candidate.decryptedValue}</span>
                    ) : (
                      <span className="status-encrypted">🔒 Encrypted Score</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="sidebar">
            <div className="ranking-section">
              <h3>🏆 Current Rankings</h3>
              <div className="ranking-list">
                {rankings.length === 0 ? (
                  <p>No verified scores yet</p>
                ) : rankings.map((item, index) => (
                  <div key={index} className="ranking-item">
                    <span className="rank">#{index + 1}</span>
                    <span className="name">{item.name}</span>
                    <span className="score">{item.score}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="fhe-info-section">
              <h3>🔐 FHE Voting Flow</h3>
              <div className="fhe-steps">
                <div className="fhe-step">
                  <span>1</span>
                  <p>Score encrypted with Zama FHE</p>
                </div>
                <div className="fhe-step">
                  <span>2</span>
                  <p>Encrypted data stored on-chain</p>
                </div>
                <div className="fhe-step">
                  <span>3</span>
                  <p>Offline decryption with relayer-sdk</p>
                </div>
                <div className="fhe-step">
                  <span>4</span>
                  <p>On-chain verification with FHE.checkSignatures</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {showVoteModal && (
        <VoteModal 
          onSubmit={castVote} 
          onClose={() => setShowVoteModal(false)} 
          voting={voting} 
          voteData={newVoteData} 
          setVoteData={setNewVoteData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedCandidate && (
        <CandidateDetailModal 
          candidate={selectedCandidate} 
          onClose={() => setSelectedCandidate(null)} 
          decryptScore={() => decryptScore(selectedCandidate.score)}
          isDecrypting={fheIsDecrypting}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const VoteModal: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  voting: boolean;
  voteData: any;
  setVoteData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, voting, voteData, setVoteData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'score') {
      const intValue = value.replace(/[^\d]/g, '');
      setVoteData({ ...voteData, [name]: intValue });
    } else {
      setVoteData({ ...voteData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="vote-modal">
        <div className="modal-header">
          <h2>🗳️ Cast Your Vote</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>🔐 FHE Encryption Active</strong>
            <p>Your score will be encrypted with Zama FHE for complete privacy</p>
          </div>
          
          <div className="form-group">
            <label>Candidate Name *</label>
            <input 
              type="text" 
              name="candidateName" 
              value={voteData.candidateName} 
              onChange={handleChange} 
              placeholder="Enter candidate name..." 
            />
          </div>
          
          <div className="form-group">
            <label>Category *</label>
            <select name="category" value={voteData.category} onChange={handleChange}>
              <option value="">Select category...</option>
              <option value="Best Film">Best Film</option>
              <option value="Best Actor">Best Actor</option>
              <option value="Best Director">Best Director</option>
              <option value="Best Music">Best Music</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Score (1-100) *</label>
            <input 
              type="number" 
              name="score" 
              min="1" 
              max="100" 
              value={voteData.score} 
              onChange={handleChange} 
              placeholder="Enter score..." 
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={voting || isEncrypting || !voteData.candidateName || !voteData.category || !voteData.score} 
            className="submit-btn"
          >
            {voting || isEncrypting ? "🔐 Encrypting Vote..." : "🗳️ Cast Vote"}
          </button>
        </div>
      </div>
    </div>
  );
};

const CandidateDetailModal: React.FC<{
  candidate: CandidateData;
  onClose: () => void;
  decryptScore: () => Promise<number | null>;
  isDecrypting: boolean;
}> = ({ candidate, onClose, decryptScore, isDecrypting }) => {
  const [localScore, setLocalScore] = useState<number | null>(null);

  const handleDecrypt = async () => {
    const score = await decryptScore();
    setLocalScore(score);
  };

  return (
    <div className="modal-overlay">
      <div className="candidate-modal">
        <div className="modal-header">
          <h2>🎬 Candidate Details</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>
        
        <div className="modal-body">
          <div className="candidate-info">
            <div className="info-row">
              <span>Name:</span>
              <strong>{candidate.name}</strong>
            </div>
            <div className="info-row">
              <span>Category:</span>
              <strong>{candidate.category}</strong>
            </div>
            <div className="info-row">
              <span>Created:</span>
              <strong>{new Date(candidate.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
          </div>
          
          <div className="score-section">
            <h3>Encrypted Score</h3>
            <div className="score-display">
              <div className="score-value">
                {candidate.isVerified ? 
                  `${candidate.decryptedValue} (Verified)` : 
                  localScore !== null ? 
                  `${localScore} (Decrypted)` : 
                  "🔒 Encrypted"
                }
              </div>
              <button 
                className={`decrypt-btn ${(candidate.isVerified || localScore !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? "🔓 Decrypting..." : 
                 candidate.isVerified ? "✅ Verified" : 
                 localScore !== null ? "🔄 Re-decrypt" : 
                 "🔓 Decrypt Score"}
              </button>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;

