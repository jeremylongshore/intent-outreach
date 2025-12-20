import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { auth } from '../lib/firebase';

export default function BetaPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((authUser) => {
      setUser(authUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Animated gradient orbs */}
        <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-0 -right-4 w-72 h-72 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-indigo-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

        <div className="relative max-w-7xl mx-auto px-6 py-24 sm:py-32">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
              </span>
              <span className="text-sm font-medium text-purple-300">Now in Beta</span>
            </div>

            <h1 className="text-5xl sm:text-7xl font-bold bg-gradient-to-r from-white via-purple-200 to-blue-200 bg-clip-text text-transparent mb-6 tracking-tight">
              PipelinePilot
            </h1>

            <p className="text-xl sm:text-2xl text-slate-300 mb-4 max-w-3xl mx-auto font-light">
              SDR-first agent orchestration platform
            </p>

            <p className="text-lg text-slate-400 mb-10 max-w-2xl mx-auto">
              Connect data sources, run intelligent playbooks, and automate your entire outreach pipeline with AI-powered agents on Google Cloud.
            </p>

            <div className="flex flex-wrap gap-4 justify-center">
              {!loading && !user && (
                <>
                  <Link
                    href="/auth"
                    className="group relative px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold hover:shadow-2xl hover:shadow-purple-500/50 transition-all duration-300 hover:scale-105"
                  >
                    <span className="relative z-10">Get Started Free</span>
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 opacity-0 group-hover:opacity-100 blur transition-opacity"></div>
                  </Link>
                  <Link
                    href="/auth"
                    className="px-8 py-4 bg-white/5 backdrop-blur-sm text-white rounded-xl font-semibold border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-300"
                  >
                    Sign In
                  </Link>
                </>
              )}
              {!loading && user && (
                <Link
                  href="/dashboard"
                  className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:shadow-2xl hover:shadow-green-500/50 transition-all duration-300 hover:scale-105"
                >
                  Open Dashboard →
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* What It Does */}
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">What PipelinePilot Does</h2>
          <p className="text-slate-400 text-lg">End-to-end SDR automation powered by AI</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon: '🔄', title: 'Data Ingestion', desc: 'Pull leads from Clay, Apollo, Clearbit, and Crunchbase' },
            { icon: '⚡', title: 'Smart Enrichment', desc: 'Normalize, dedupe, and enrich with AI-powered signals' },
            { icon: '✍️', title: 'Outreach Generation', desc: 'Create context-aware emails and messaging with Vertex AI' },
            { icon: '🎯', title: 'Playbook Orchestration', desc: 'Run multi-step workflows with intelligent routing' },
            { icon: '📊', title: 'Real-time Analytics', desc: 'Surface health, readiness, and performance metrics' },
            { icon: '🔒', title: 'Secure by Design', desc: 'Multi-tenant isolation with enterprise-grade security' },
          ].map((item, i) => (
            <div
              key={i}
              className="group p-6 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-sm border border-white/10 hover:border-purple-500/50 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-purple-500/10"
            >
              <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">{item.icon}</div>
              <h3 className="text-xl font-semibold text-white mb-2">{item.title}</h3>
              <p className="text-slate-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How It Works */}
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">How It Works</h2>
          <p className="text-slate-400 text-lg">From signup to first campaign in minutes</p>
        </div>

        <div className="space-y-6">
          {[
            { num: '01', title: 'Account & Billing via Stripe', desc: 'Stripe manages subscription state. Webhooks keep your workspace in sync automatically.' },
            { num: '02', title: 'Workspace Provisioning', desc: 'Your tenant is created in Firestore with per-tenant Secret Manager keys for all integrations.' },
            { num: '03', title: 'Readiness Gate (ARV)', desc: 'Automated validation checks secrets, IAM, endpoints, and Vertex AI access before allowing runs.' },
            { num: '04', title: 'Run Playbooks', desc: 'Launch research → enrichment → outreach flows. All data lives securely under your tenant.' },
            { num: '05', title: 'Observe & Improve', desc: 'Results stream to your dashboard. The system learns and proposes fixes automatically.' },
          ].map((step, i) => (
            <div
              key={i}
              className="group relative p-8 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-sm border border-white/10 hover:border-purple-500/50 transition-all duration-300"
            >
              <div className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-2xl font-bold text-white group-hover:scale-110 transition-transform duration-300">
                  {step.num}
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-semibold text-white mb-2">{step.title}</h3>
                  <p className="text-slate-400 text-lg">{step.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agents */}
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">Intelligent Agents</h2>
          <p className="text-slate-400 text-lg">Specialized AI agents working together</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { icon: '🎭', name: 'Orchestrator', desc: 'Plans and routes tasks across the entire workflow' },
            { icon: '🔍', name: 'Research', desc: 'Pulls and normalizes leads from multiple sources' },
            { icon: '💎', name: 'Enrich', desc: 'Fills gaps, dedupes, and scores lead fitness' },
            { icon: '📧', name: 'Outreach', desc: 'Generates channel-appropriate copy with guardrails' },
          ].map((agent, i) => (
            <div
              key={i}
              className="group p-6 rounded-2xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 backdrop-blur-sm border border-purple-500/20 hover:border-purple-500/50 transition-all duration-300 hover:scale-105"
            >
              <div className="text-5xl mb-4 group-hover:scale-110 transition-transform duration-300">{agent.icon}</div>
              <h3 className="text-xl font-semibold text-white mb-2">{agent.name}</h3>
              <p className="text-slate-400">{agent.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Integrations & Slack */}
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">Integrations & Slack</h2>
          <p className="text-slate-400 text-lg">Work where your team already lives</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <div className="p-8 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-sm border border-white/10 hover:border-green-500/50 transition-all duration-300">
            <div className="text-4xl mb-4">💬</div>
            <h3 className="text-2xl font-semibold text-white mb-4">Slack Notifications</h3>
            <ul className="space-y-3 text-slate-400">
              <li className="flex items-start gap-3">
                <span className="text-green-500 mt-1">✓</span>
                <span>Real-time alerts for runs, completions, and failures</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-500 mt-1">✓</span>
                <span>Channel mapping per tenant (#sdr-ops, #lead-intake)</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-500 mt-1">✓</span>
                <span>Webhook or Bot token configuration</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-500 mt-1">✓</span>
                <span>Per-tenant secrets in Secret Manager</span>
              </li>
            </ul>
          </div>

          <div className="p-8 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-sm border border-white/10 hover:border-blue-500/50 transition-all duration-300">
            <div className="text-4xl mb-4">⚡</div>
            <h3 className="text-2xl font-semibold text-white mb-4">Slash Commands</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                <code className="text-purple-400 font-mono">/pp status</code>
                <span className="text-slate-400 text-sm">→ Show tenant health</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                <code className="text-purple-400 font-mono">/pp audit</code>
                <span className="text-slate-400 text-sm">→ Run tenant audit</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                <code className="text-purple-400 font-mono">/pp run</code>
                <span className="text-slate-400 text-sm">→ Start playbook</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-8 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-sm border border-white/10">
          <div className="text-4xl mb-4">🔗</div>
          <h3 className="text-2xl font-semibold text-white mb-4">Webhooks & CRMs</h3>
          <p className="text-slate-400 mb-4">
            Connect to any system with HMAC-signed webhooks, CRM integrations, or low-code tools like Zapier.
          </p>
          <div className="flex flex-wrap gap-2">
            {['run.completed', 'lead.enriched', 'outreach.drafted'].map((topic) => (
              <span key={topic} className="px-3 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 text-sm font-mono">
                {topic}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="p-8 rounded-2xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 backdrop-blur-sm border border-purple-500/20">
          <div className="flex items-start gap-6">
            <div className="text-5xl">🔒</div>
            <div className="flex-1">
              <h2 className="text-3xl font-bold text-white mb-4">Enterprise-Grade Security</h2>
              <div className="grid md:grid-cols-2 gap-4 text-slate-300">
                <div className="flex items-start gap-3">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Per-tenant data isolation in Firestore</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Firestore rules enforce tenant boundaries</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Least-privilege IAM for Secret Manager</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>No secrets in environment variables</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="max-w-4xl mx-auto px-6 py-20">
        <div className="relative p-12 rounded-3xl bg-gradient-to-br from-purple-600 to-blue-600 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20 backdrop-blur-3xl"></div>
          <div className="relative z-10 text-center">
            <h2 className="text-4xl font-bold text-white mb-4">Ready to automate your pipeline?</h2>
            <p className="text-purple-100 text-lg mb-8">Join beta testers building the future of SDR automation</p>

            {!loading && !user && (
              <div className="flex flex-wrap gap-4 justify-center">
                <Link
                  href="/auth"
                  className="px-8 py-4 bg-white text-purple-600 rounded-xl font-semibold hover:bg-purple-50 transition-all duration-300 hover:scale-105 hover:shadow-2xl"
                >
                  Get Started Free
                </Link>
                <a
                  href="https://docs.example.com/pipelinepilot"
                  target="_blank"
                  rel="noreferrer"
                  className="px-8 py-4 bg-white/10 backdrop-blur-sm text-white rounded-xl font-semibold border border-white/20 hover:bg-white/20 transition-all duration-300"
                >
                  View Documentation
                </a>
              </div>
            )}

            {!loading && user && (
              <Link
                href="/dashboard"
                className="inline-block px-8 py-4 bg-white text-purple-600 rounded-xl font-semibold hover:bg-purple-50 transition-all duration-300 hover:scale-105 hover:shadow-2xl"
              >
                Open Your Dashboard →
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* For Builders */}
      <div className="max-w-7xl mx-auto px-6 pb-20">
        <div className="p-8 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-sm border border-white/10">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-3xl">👨‍💻</span>
            <h2 className="text-2xl font-bold text-white">For Builders</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <div className="text-purple-400 font-medium mb-2">Firestore Paths</div>
              <code className="text-slate-400 text-xs">/tenants/{'{tenantId}'}</code><br/>
              <code className="text-slate-400 text-xs">/system/arv-runs/runs/*</code>
            </div>
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <div className="text-purple-400 font-medium mb-2">Secret Manager</div>
              <code className="text-slate-400 text-xs">TENANT_{'{tenantId}'}_{'{PROVIDER}'}_API_KEY</code><br/>
              <code className="text-slate-400 text-xs">TENANT_{'{tenantId}'}_SLACK_BOT_TOKEN</code>
            </div>
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <div className="text-purple-400 font-medium mb-2">Functions</div>
              <code className="text-slate-400 text-xs">/notifySlack</code><br/>
              <code className="text-slate-400 text-xs">/slackCommand</code>
            </div>
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <div className="text-purple-400 font-medium mb-2">Webhook Topics</div>
              <code className="text-slate-400 text-xs">run.completed</code><br/>
              <code className="text-slate-400 text-xs">lead.enriched</code>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
}
