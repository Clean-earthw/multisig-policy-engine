import { useState, useEffect } from "react";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useAccount } from "wagmi";
import { formatEther, decodeFunctionData, type Address } from "viem";
import { FLARE_COSTON2_CHAIN, riskColor, riskLabel, decodeCheckResults } from "../lib/constants";
import { CopyableAddress } from "../components/CopyableAddress";
import { MULTISIG_WALLET_ABI, ERC20_ABI } from "../lib/abi";
import { Link } from "react-router-dom";
import { useMultisig } from "../context/MultisigContext";

interface Transaction {
  id: number;
  target: Address;
  data: `0x${string}`;
  value: bigint;
  nonce: bigint;
  executed: boolean;
  evaluated: boolean;
  requiredSigners: number;
  riskScore: number;
  checkResults: number;
  matchedPolicyId: bigint;
  instructionId: `0x${string}`;
  approvalCount: number;
  requiredSignerSet?: Address[];
  usdcValue?: string;
}

export default function PendingTransactionsPage() {
  const { selectedMultisig, hasSelection } = useMultisig();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasApprovedMap, setHasApprovedMap] = useState<Map<number, boolean>>(new Map());

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  // NEW: Fetch all pending transactions
  useEffect(() => {
    if (!selectedMultisig || !publicClient) return;

    const fetchTransactions = async () => {
      setLoading(true);
      try {
        const count = await publicClient.readContract({
          address: selectedMultisig.wallet,
          abi: MULTISIG_WALLET_ABI,
          functionName: "txCount",
        });

        const txs: Transaction[] = [];

        for (let i = 0; i < Number(count); i++) {
          const result = await publicClient.readContract({
            address: selectedMultisig.wallet,
            abi: MULTISIG_WALLET_ABI,
            functionName: "getTransaction",
            args: [BigInt(i)],
          });

          const approvalCount = await publicClient.readContract({
            address: selectedMultisig.wallet,
            abi: MULTISIG_WALLET_ABI,
            functionName: "approvalCount",
            args: [BigInt(i)],
          });

          // NEW: Skip executed transactions
          if (!result[4]) {
            const data = result[1] as `0x${string}`;
            let usdcValue: string | undefined;
            
            // NEW: Decode ERC20 transfer for display
            if (data && data !== "0x" && data.length >= 138) {
              try {
                const decoded = decodeFunctionData({
                  abi: ERC20_ABI,
                  data: data,
                });
                if (decoded.functionName === "transfer" && decoded.args && decoded.args[1]) {
                  usdcValue = formatEther(decoded.args[1] as bigint);
                }
              } catch {
                // Not an ERC20 transfer
              }
            }
            
            txs.push({
              id: i,
              target: result[0] as Address,
              data: data,
              value: result[2] as bigint,
              nonce: result[3] as bigint,
              executed: result[4] as boolean,
              evaluated: result[5] as boolean,
              requiredSigners: Number(result[6]),
              riskScore: Number(result[7]),
              checkResults: Number(result[8]),
              matchedPolicyId: result[9] as bigint,
              instructionId: result[10] as `0x${string}`,
              approvalCount: Number(approvalCount),
              usdcValue,
            });
          }
        }

        setTransactions(txs.reverse());

        // NEW: Check user approvals
        if (address) {
          const approvedMap = new Map<number, boolean>();
          for (const tx of txs) {
            const hasApproved = await publicClient.readContract({
              address: selectedMultisig.wallet,
              abi: MULTISIG_WALLET_ABI,
              functionName: "hasApproved",
              args: [BigInt(tx.id), address],
            });
            approvedMap.set(tx.id, hasApproved);
          }
          setHasApprovedMap(approvedMap);
        }
      } catch (err) {
        console.error("Failed to fetch transactions:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [selectedMultisig, publicClient, address, isSuccess]);

  const handleApprove = (txId: number) => {
    if (!selectedMultisig) return;
    writeContract({
      address: selectedMultisig.wallet,
      abi: MULTISIG_WALLET_ABI,
      functionName: "approveTx",
      args: [BigInt(txId)],
    });
  };

  const handleExecute = (txId: number) => {
    if (!selectedMultisig) return;
    writeContract({
      address: selectedMultisig.wallet,
      abi: MULTISIG_WALLET_ABI,
      functionName: "executeTx",
      args: [BigInt(txId)],
    });
  };

  if (!hasSelection) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">No Multisig Selected</h2>
        <p className="text-[var(--text-secondary)] mb-6">
          Please select a multisig wallet to view pending transactions
        </p>
        <Link to="/" className="btn btn-primary">
          Go to Home
        </Link>
      </div>
    );
  }

  const pendingCount = transactions.filter(tx => !tx.evaluated).length;
  const readyCount = transactions.filter(tx => tx.evaluated && !tx.executed).length;
  const canExecuteCount = transactions.filter(tx => tx.evaluated && !tx.executed && tx.approvalCount >= tx.requiredSigners).length;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Pending Transactions</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {loading ? "Loading..." : `${readyCount} ready for approval, ${pendingCount} awaiting evaluation`}
          </p>
        </div>
        <Link to="/transact" className="btn btn-primary">
          Submit New
        </Link>
      </div>

      {/* NEW: Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card">
          <div className="text-sm text-[var(--text-secondary)]">Awaiting Evaluation</div>
          <div className="text-2xl font-bold text-[var(--orange)]">{pendingCount}</div>
        </div>
        <div className="card">
          <div className="text-sm text-[var(--text-secondary)]">Ready for Approval</div>
          <div className="text-2xl font-bold text-[var(--accent)]">{readyCount}</div>
        </div>
        <div className="card">
          <div className="text-sm text-[var(--text-secondary)]">Ready to Execute</div>
          <div className="text-2xl font-bold text-[var(--green)]">{canExecuteCount}</div>
        </div>
      </div>

      {loading ? (
        <div className="card text-center py-12 text-[var(--text-secondary)]">
          Loading transactions...
        </div>
      ) : transactions.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--text-secondary)] mb-4">No pending transactions</p>
          <Link to="/transact" className="btn btn-primary">
            Submit a Transaction
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {transactions.map((tx) => {
            const isReadyForApproval = tx.evaluated && !tx.executed;
            const canExecute = tx.approvalCount >= tx.requiredSigners;
            const userHasApproved = hasApprovedMap.get(tx.id) || false;

            return (
              <div key={tx.id} className="card">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-mono text-[var(--text-secondary)]">
                        TX #{tx.id}
                      </span>
                      {!tx.evaluated ? (
                        <span className="badge badge-yellow">Awaiting Evaluation</span>
                      ) : !tx.executed ? (
                        <span className="badge badge-blue">Ready for Approval</span>
                      ) : (
                        <span className="badge badge-green">Executed</span>
                      )}
                      {tx.evaluated && (
                        <span
                          className="badge"
                          style={{
                            background: `${riskColor(tx.riskScore)}20`,
                            color: riskColor(tx.riskScore),
                          }}
                        >
                          {riskLabel(tx.riskScore)} Risk ({tx.riskScore})
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-[var(--text-secondary)]">Target:</span>{" "}
                        <CopyableAddress address={tx.target} />
                      </div>
                      {tx.usdcValue && (
                        <div>
                          <span className="text-[var(--text-secondary)]">USDC Amount:</span>{" "}
                          <span className="font-mono text-[var(--accent)]">{tx.usdcValue} USDC</span>
                        </div>
                      )}
                      {tx.evaluated && (
                        <>
                          <div>
                            <span className="text-[var(--text-secondary)]">Policy:</span>{" "}
                            <span className="font-mono">ID {tx.matchedPolicyId.toString()}</span>
                          </div>
                          <div>
                            <span className="text-[var(--text-secondary)]">Approvals:</span>{" "}
                            <span className={`font-mono ${canExecute ? "text-[var(--green)]" : ""}`}>
                              {tx.approvalCount} / {tx.requiredSigners}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* NEW: Check results summary */}
                    {tx.evaluated && tx.checkResults > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {decodeCheckResults(tx.checkResults)
                          .filter((c) => c.pass)
                          .slice(0, 5)
                          .map((check) => (
                            <span
                              key={check.bit}
                              className="text-xs px-2 py-0.5 rounded bg-[var(--green)] bg-opacity-10 text-[var(--green)]"
                            >
                              ✓ {check.label}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    {isReadyForApproval && !userHasApproved && (
                      <button
                        onClick={() => handleApprove(tx.id)}
                        disabled={isPending || isConfirming}
                        className="btn btn-sm btn-primary"
                      >
                        {isPending || isConfirming ? "Approving..." : "Approve"}
                      </button>
                    )}
                    {isReadyForApproval && userHasApproved && (
                      <span className="text-xs text-black px-2 py-1 bg-[var(--green)] bg-opacity-10 rounded">
                        You approved
                      </span>
                    )}
                    {isReadyForApproval && canExecute && (
                      <button
                        onClick={() => handleExecute(tx.id)}
                        disabled={isPending || isConfirming}
                        className="btn btn-sm"
                        style={{
                          background: "var(--green)",
                          color: "black",
                        }}
                      >
                        {isPending || isConfirming ? "Executing..." : "Execute"}
                      </button>
                    )}
                    {!tx.evaluated && (
                      <Link
                        to={`/transact?tx=${tx.id}`}
                        className="btn btn-sm btn-secondary"
                      >
                        Evaluate
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hash && (
        <div className="mt-6 card border-[var(--green)]">
          <h4 className="font-medium text-[var(--green)] mb-2">Transaction Submitted!</h4>
          <div className="text-sm text-[var(--text-secondary)] break-all">{hash}</div>
        </div>
      )}
    </div>
  );
}