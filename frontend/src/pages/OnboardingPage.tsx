import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { decodeEventLog } from "viem";
import { FLARE_COSTON2_CHAIN, CONTRACTS, PRESET_DESCRIPTIONS } from "../lib/constants";
import { CopyableAddress } from "../components/CopyableAddress";
import { WALLET_FACTORY_ABI } from "../lib/abi";

type Step = "signers" | "policies" | "review" | "deploying" | "done";

interface DeploymentResult {
  wallet: `0x${string}`;
  governance: `0x${string}`;
  policyRegistry: `0x${string}`;
  auditLog: `0x${string}`;
}

const STEPS: { key: Step; num: number; label: string }[] = [
  { key: "signers", num: 1, label: "Signers" },
  { key: "policies", num: 2, label: "Policies" },
  { key: "review", num: 3, label: "Review" },
  { key: "deploying", num: 4, label: "Deploy" },
];

// NEW: Preset metadata with descriptions
const PRESET_META = [
  { 
    id: 0, 
    name: "Low-Value Transfer", 
    icon: "💵", 
    riskWeight: 2, 
    color: "var(--green)",
    description: "Auto-approve transfers under $1,000. Low friction for everyday operations. Requires 1 signer."
  },
  { 
    id: 1, 
    name: "High-Value Transfer", 
    icon: "💰", 
    riskWeight: 5, 
    color: "var(--accent)",
    description: "High-Value Transfers over $1,000 USDC. Requires multi-sig approval with 2 signers and medium risk checks."
  },
  { 
    id: 2, 
    name: "Treasury Management", 
    icon: "🔒", 
    riskWeight: 9, 
    color: "var(--red)",
    description: "Very High Value transfers over $50K. Requires verified contracts and 3 signers for admin-level approval."
  },
  { 
    id: 3, 
    name: "DeFi Interaction", 
    icon: "⚙️", 
    riskWeight: 6, 
    color: "var(--blue)",
    description: "Interact with whitelisted DeFi protocols. Moderate limits with balanced security requiring 2 signers."
  },
];

export default function OnboardingPage() {
  const { address, isConnected } = useAccount();
  const [step, setStep] = useState<Step>("signers");
  const [signers, setSigners] = useState<`0x${string}`[]>([]);
  const [selectedPresets, setSelectedPresets] = useState<Set<number>>(new Set([0, 1, 2, 3]));
  const [deployment, setDeployment] = useState<DeploymentResult | null>(null);
  const [newSigner, setNewSigner] = useState("");

  const addSigner = useCallback((addr: `0x${string}`) => {
    if (addr.startsWith("0x") && addr.length === 42) {
      setSigners((prev) => {
        if (prev.includes(addr)) return prev;
        return [...prev, addr];
      });
    }
  }, []);

  const removeSigner = useCallback((addr: `0x${string}`) => {
    setSigners((prev) => prev.filter((s) => s !== addr));
  }, []);

  const togglePreset = useCallback((id: number) => {
    setSelectedPresets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="card max-w-md text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="text-xl font-bold mb-2">Connect Your Wallet</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Connect your wallet to create a new multisig with preset policies.
          </p>
        </div>
      </div>
    );
  }

  if (step === "done" && deployment) {
    return <SuccessStep deployment={deployment} />;
  }

  if (step === "deploying") {
    return (
      <DeployStep
        signers={signers}
        selectedPresets={selectedPresets}
        onDone={(r) => {
          setDeployment(r);
          setStep("done");
        }}
      />
    );
  }

  const currentStepNum = STEPS.find((s) => s.key === step)?.num ?? 1;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold">Create Multisig Wallet</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Set up a Safe-like multisig with governance and preset policies in one transaction.
        </p>
      </div>

      <StepIndicator steps={STEPS} currentStep={currentStepNum} />

      {step === "signers" && (
        <SignersStep
          signers={signers}
          newSigner={newSigner}
          setNewSigner={setNewSigner}
          onAddSigner={() => {
            const addr = newSigner.trim() as `0x${string}`;
            addSigner(addr);
            setNewSigner("");
          }}
          onRemoveSigner={removeSigner}
          onAddSelf={() => address && addSigner(address)}
          connectedAddress={address}
          onNext={() => setStep("policies")}
        />
      )}
      {step === "policies" && (
        <PoliciesStep
          selectedPresets={selectedPresets}
          onToggle={togglePreset}
          onBack={() => setStep("signers")}
          onNext={() => setStep("review")}
        />
      )}
      {step === "review" && (
        <ReviewStep
          signers={signers}
          selectedPresets={selectedPresets}
          onBack={() => setStep("policies")}
          onDeploy={() => setStep("deploying")}
        />
      )}
    </div>
  );
}

function StepIndicator({ steps, currentStep }: { steps: typeof STEPS; currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map(({ key, num, label }) => (
        <div key={key} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
              num < currentStep
                ? "bg-[var(--green)] text-black"
                : num === currentStep
                  ? "bg-[var(--accent)] text-black"
                  : "bg-[var(--bg-card)] text-[var(--text-secondary)]"
            }`}
          >
            {num < currentStep ? "✓" : num}
          </div>
          <span
            className={`text-sm hidden sm:inline ${
              num === currentStep ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-secondary)]"
            }`}
          >
            {label}
          </span>
          {num < steps.length && <div className="w-8 h-px bg-[var(--border)]" />}
        </div>
      ))}
    </div>
  );
}

function SignersStep({
  signers,
  newSigner,
  setNewSigner,
  onAddSigner,
  onRemoveSigner,
  onAddSelf,
  connectedAddress,
  onNext,
}: {
  signers: `0x${string}`[];
  newSigner: string;
  setNewSigner: (v: string) => void;
  onAddSigner: () => void;
  onRemoveSigner: (addr: `0x${string}`) => void;
  onAddSelf: () => void;
  connectedAddress?: `0x${string}`;
  onNext: () => void;
}) {
  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-1">Add Signers</h3>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        Add wallet addresses that will govern the multisig. All signers will be included in each policy.
      </p>

      <div className="flex gap-2 mb-3">
        <input
          value={newSigner}
          onChange={(e) => setNewSigner(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onAddSigner())}
          placeholder="0x..."
          className="flex-1 font-mono text-sm"
        />
        <button onClick={onAddSigner} className="btn btn-secondary btn-sm whitespace-nowrap">
          Add
        </button>
      </div>

      {connectedAddress && !signers.includes(connectedAddress) && (
        <button
          onClick={onAddSelf}
          className="text-xs text-[var(--accent)] hover:underline mb-3 block"
        >
          + Add your connected wallet
        </button>
      )}

      {signers.length === 0 ? (
        <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
          No signers added yet. Add at least one signer to continue.
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {signers.map((s, i) => (
            <div
              key={s}
              className="flex items-center justify-between bg-[var(--bg-secondary)] rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--text-secondary)] w-6">#{i + 1}</span>
                <CopyableAddress address={s} />
                {connectedAddress === s && (
                  <span className="badge badge-yellow text-xs">You</span>
                )}
              </div>
              <button
                onClick={() => onRemoveSigner(s)}
                className="text-[var(--red)] text-lg px-2 hover:opacity-80"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <span className="text-sm text-[var(--text-secondary)]">
          {signers.length} signer{signers.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={onNext}
          disabled={signers.length < 1}
          className="btn btn-primary"
        >
          Continue to Policies →
        </button>
      </div>
    </div>
  );
}

function PoliciesStep({
  selectedPresets,
  onToggle,
  onBack,
  onNext,
}: {
  selectedPresets: Set<number>;
  onToggle: (id: number) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-1">Select Preset Policies</h3>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        Choose which policies to include. You can add custom policies later via governance. All signers will be added to each policy.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {PRESET_META.map((preset) => {
          const selected = selectedPresets.has(preset.id);
          return (
            <button
              key={preset.id}
              onClick={() => onToggle(preset.id)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                selected
                  ? "border-[var(--accent)] bg-[var(--bg-card-hover)]"
                  : "border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--text-secondary)]"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{preset.icon}</span>
                  <span className="font-semibold text-sm">{preset.name}</span>
                </div>
                <div
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-xs transition-colors ${
                    selected
                      ? "bg-[var(--accent)] border-[var(--accent)] text-black"
                      : "border-[var(--border)]"
                  }`}
                >
                  {selected ? "✓" : ""}
                </div>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-2">
                {preset.description}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: preset.color }}>
                  Risk: {preset.riskWeight}/10
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="btn btn-secondary">
          Back
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--text-secondary)]">
            {selectedPresets.size} of {PRESET_META.length} selected
          </span>
          <button onClick={onNext} className="btn btn-primary">
            Review
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewStep({
  signers,
  selectedPresets,
  onBack,
  onDeploy,
}: {
  signers: `0x${string}`[];
  selectedPresets: Set<number>;
  onBack: () => void;
  onDeploy: () => void;
}) {
  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Review Configuration</h3>

      <div className="space-y-4 mb-6">
        <div className="h-px bg-[var(--border)]" />

        <div>
          <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
            Signers ({signers.length})
          </h4>
          <div className="space-y-1.5">
            {signers.map((s, i) => (
              <div key={s} className="flex items-center gap-2 text-sm">
                <span className="text-[var(--text-secondary)]">#{i + 1}</span>
                <CopyableAddress address={s} />
              </div>
            ))}
          </div>
        </div>

        <div className="h-px bg-[var(--border)]" />

        <div>
          <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
            Preset Policies ({selectedPresets.size})
          </h4>
          <div className="space-y-2">
            {Array.from(selectedPresets)
              .sort()
              .map((id) => {
                const preset = PRESET_META.find(p => p.id === id);
                return (
                  <div key={id} className="flex items-center gap-2 text-sm">
                    <span className="badge badge-green">{preset?.name}</span>
                    <span className="text-[var(--text-secondary)] text-xs">
                      {preset?.description.substring(0, 60)}...
                    </span>
                  </div>
                );
              })}
            {selectedPresets.size === 0 && (
              <p className="text-sm text-[var(--text-secondary)]">No preset policies selected.</p>
            )}
          </div>
        </div>

        <div className="h-px bg-[var(--border)]" />

        <div>
          <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
            What will be deployed
          </h4>
          <div className="space-y-1.5 text-sm">
            <DeployLine color="var(--green)" label="GovernanceMultisig (unanimous consent)" />
            <DeployLine color="var(--green)" label="PolicyRegistry (governed by multisig)" />
            <DeployLine color="var(--green)" label="AuditLog (append-only)" />
            <DeployLine color="var(--green)" label="MultisigWallet (minimal proxy clone)" />
            {selectedPresets.size > 0 && (
              <DeployLine
                color="var(--accent)"
                label={`${selectedPresets.size} preset policies registered`}
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="btn btn-secondary">
          Back
        </button>
        <button onClick={onDeploy} className="btn btn-primary">
          Deploy Wallet
        </button>
      </div>
    </div>
  );
}

function DeployLine({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      {label}
    </div>
  );
}

function DeployStep({
  signers,
  selectedPresets,
  onDone,
}: {
  signers: `0x${string}`[];
  selectedPresets: Set<number>;
  onDone: (result: DeploymentResult) => void;
}) {
  const publicClient = usePublicClient();
  const { writeContract, data: txHash, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ 
    hash: txHash 
  });
  const [receipt, setReceipt] = useState<any>(null);

  const presetIds = Array.from(selectedPresets).sort().map(BigInt);

  // NEW: Fetch and parse receipt when transaction succeeds
  useEffect(() => {
    if (isSuccess && txHash && publicClient && !receipt) {
      publicClient.getTransactionReceipt({ hash: txHash }).then((fullReceipt) => {
        setReceipt(fullReceipt);
      }).catch(console.error);
    }
  }, [isSuccess, txHash, publicClient, receipt]);

  // NEW: Parse WalletCreated event from logs
  useEffect(() => {
    if (receipt && publicClient) {
      for (const log of receipt.logs || []) {
        if (log.address.toLowerCase() !== CONTRACTS.walletFactory.toLowerCase()) {
          continue;
        }
        
        try {
          const decoded = decodeEventLog({
            abi: WALLET_FACTORY_ABI,
            eventName: "WalletCreated",
            data: log.data,
            topics: log.topics,
          });

          const args = decoded.args as unknown as {
            creator: `0x${string}`;
            wallet: `0x${string}`;
            governance: `0x${string}`;
            policyRegistry: `0x${string}`;
            auditLog: `0x${string}`;
          };

          onDone({
            wallet: args.wallet,
            governance: args.governance,
            policyRegistry: args.policyRegistry,
            auditLog: args.auditLog,
          });
          return;
        } catch {
          continue;
        }
      }
    }
  }, [receipt, publicClient, onDone]);

  if (isSuccess) {
    return (
      <div className="max-w-md mx-auto">
        <div className="card text-center py-8">
          <div className="text-4xl mb-4">✅</div>
          <h3 className="text-xl font-bold text-[var(--green)] mb-2">Wallet Deployed!</h3>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Your multisig wallet has been created with all contracts and policies in a single transaction.
          </p>
          {txHash && (
            <a
              href={`https://coston2-explorer.flare.network/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-[var(--accent)] hover:underline font-mono"
            >
              View transaction →
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="card text-center py-8">
        {!txHash && (
          <>
            <div className="text-4xl mb-4">🚀</div>
            <h3 className="text-xl font-bold mb-2">Ready to Deploy</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              This will deploy governance multisig, policy registry, audit log, and wallet proxy in one transaction.
              {presetIds.length > 0 && ` ${presetIds.length} preset policies will be registered.`}
            </p>
            {error && (
              <p className="text-sm text-[var(--red)] mb-4">
                {(error as Error).message.slice(0, 100)}
              </p>
            )}
            <button
              onClick={() =>
                writeContract({
                  address: CONTRACTS.walletFactory,
                  abi: WALLET_FACTORY_ABI,
                  functionName: "createWallet",
                  args: [signers, presetIds],
                  chainId: FLARE_COSTON2_CHAIN.id,
                })
              }
              className="btn btn-primary"
            >
              Confirm Deployment
            </button>
          </>
        )}

        {txHash && isConfirming && (
          <>
            <div className="text-4xl mb-4 animate-pulse">⚡</div>
            <h3 className="text-xl font-bold mb-2">Deploying...</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Waiting for confirmation on Flare Coston2.
            </p>
            <CopyableAddress address={txHash} short={false} />
          </>
        )}
      </div>
    </div>
  );
}

function SuccessStep({ deployment }: { deployment: DeploymentResult }) {
  const navigate = useNavigate();
  
  return (
    <div className="max-w-lg mx-auto">
      <div className="card text-center py-8">
        <div className="text-4xl mb-4">🎉</div>
        <h3 className="text-xl font-bold text-[var(--green)] mb-2">Multisig Wallet Created!</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          All contracts have been deployed and configured. You're ready to start using your wallet.
        </p>

        <div className="text-left space-y-3 mb-6">
          <ContractRow label="Multisig Wallet" address={deployment.wallet} />
          <ContractRow label="Governance" address={deployment.governance} />
          <ContractRow label="Policy Registry" address={deployment.policyRegistry} />
          <ContractRow label="Audit Log" address={deployment.auditLog} />
        </div>

        <button
          onClick={() => navigate("/transact")}
          className="btn btn-primary text-lg px-8 py-3"
        >
          Go to Transact →
        </button>
      </div>
    </div>
  );
}

function ContractRow({ label, address }: { label: string; address: `0x${string}` }) {
  return (
    <div className="flex items-center justify-between bg-[var(--bg-secondary)] rounded-lg px-3 py-2">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <CopyableAddress address={address} />
    </div>
  );
}