import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  Cookie,
  FileText,
  HelpCircle,
  X,
  Send,
  Sparkles,
  CheckCircle2,
  Lock,
  LifeBuoy
} from "lucide-react";
import { toast } from "sonner";

export default function Footer() {
  const [activeModal, setActiveModal] = useState(null); // "privacy" | "cookies" | "terms" | "support" | null

  // Support Form State
  const [supportName, setSupportName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportCategory, setSupportCategory] = useState("general");
  const [supportMessage, setSupportMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  const handleSupportSubmit = (e) => {
    e.preventDefault();
    if (!supportEmail || !supportMessage) {
      toast.error("Please fill in email and message.");
      return;
    }
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setSubmittedSuccess(true);
      toast.success("Support ticket submitted successfully! ⚡");
    }, 800);
  };

  const closeModal = () => {
    setActiveModal(null);
    setSubmittedSuccess(false);
    setSupportMessage("");
  };

  return (
    <footer className="mt-16 border-t border-[#27272a] bg-[#050505] text-zinc-400 pb-12 sm:pb-16">
      <div className="mx-auto max-w-[1440px] px-6 py-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          
          {/* Brand & Tagline */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-black tracking-widest text-[#e5ff00]">
                SPARKZ.TV
              </span>
              <span className="border border-[#e5ff00]/40 bg-[#e5ff00]/10 px-1.5 py-0.5 font-mono text-[9px] uppercase font-bold text-[#e5ff00]">
                UNDERGROUND LIVE
              </span>
            </div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500 max-w-md">
              High-bandwidth decentralized live video streaming for underground creators, DJs, and electronic broadcasts.
            </p>
          </div>

          {/* Navigation Links */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 font-mono text-xs uppercase font-bold tracking-widest text-zinc-300">
            <button
              type="button"
              data-testid="footer-privacy-btn"
              onClick={() => setActiveModal("privacy")}
              className="flex items-center gap-1.5 hover:text-[#e5ff00] transition-colors cursor-pointer"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-[#e5ff00]" />
              <span>Privacy Policy</span>
            </button>

            <button
              type="button"
              data-testid="footer-cookies-btn"
              onClick={() => setActiveModal("cookies")}
              className="flex items-center gap-1.5 hover:text-[#e5ff00] transition-colors cursor-pointer"
            >
              <Cookie className="h-3.5 w-3.5 text-[#e5ff00]" />
              <span>Cookies</span>
            </button>

            <button
              type="button"
              data-testid="footer-terms-btn"
              onClick={() => setActiveModal("terms")}
              className="flex items-center gap-1.5 hover:text-[#e5ff00] transition-colors cursor-pointer"
            >
              <FileText className="h-3.5 w-3.5 text-[#e5ff00]" />
              <span>Terms & Conditions</span>
            </button>

            <button
              type="button"
              data-testid="footer-support-btn"
              onClick={() => setActiveModal("support")}
              className="flex items-center gap-1.5 hover:text-[#e5ff00] transition-colors cursor-pointer border border-[#e5ff00]/40 bg-[#e5ff00]/5 px-2.5 py-1 text-[#e5ff00] hover:bg-[#e5ff00]/20"
            >
              <LifeBuoy className="h-3.5 w-3.5" />
              <span>Support</span>
            </button>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 flex flex-col items-start justify-between gap-4 border-t border-zinc-900 pt-6 sm:flex-row sm:items-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-600">
            © {new Date().getFullYear()} SPARKZ.TV — BROADCASTING FROM SOMEWHERE
          </div>
          <div className="flex gap-4 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-600">
            <span>PWR: AWS IVS</span>
            <span>BUILT LOUD</span>
          </div>
        </div>
      </div>

      {/* ===================== MODALS ===================== */}

      {/* Privacy Policy Modal */}
      {activeModal === "privacy" && (
        <LegalModal
          title="PRIVACY POLICY"
          icon={<ShieldCheck className="h-5 w-5 text-[#e5ff00]" />}
          onClose={closeModal}
        >
          <div className="space-y-4 text-xs font-sans text-zinc-300 leading-relaxed">
            <div className="border border-[#e5ff00]/30 bg-[#e5ff00]/5 p-3 font-mono text-[11px] uppercase text-[#e5ff00]">
              EFFECTIVE DATE: AUGUST 2026 // SPARKZ.TV DATA PROTOCOL
            </div>

            <section className="space-y-2">
              <h4 className="font-mono text-sm font-bold uppercase text-white tracking-wider">
                1. INFORMATION WE COLLECT
              </h4>
              <p>
                When you create an account or stream on Sparkz.TV, we collect account details (username, display name, email address, avatar photo), channel setup metadata, and streaming metrics (viewership stats, Watts points earned).
              </p>
            </section>

            <section className="space-y-2">
              <h4 className="font-mono text-sm font-bold uppercase text-white tracking-wider">
                2. 24-HOUR STORIES & AUTO-DESTRUCTION
              </h4>
              <p>
                Media uploaded to the <strong>Stories Transmissions</strong> section (photos, short video clips, captions) are strictly temporary. All story data is set with an explicit 24-hour expiration timestamp. Once expired, story files and records are <strong>permanently purged</strong> from our storage systems and cannot be recovered.
              </p>
            </section>

            <section className="space-y-2">
              <h4 className="font-mono text-sm font-bold uppercase text-white tracking-wider">
                3. LIVE BROADCASTING & MEDIA
              </h4>
              <p>
                Live video feeds routed through Amazon IVS servers are ingested in real-time. Broadcasters retain full ownership of their original performances, sound recordings, and live audiovisual content.
              </p>
            </section>

            <section className="space-y-2">
              <h4 className="font-mono text-sm font-bold uppercase text-white tracking-wider">
                4. DATA SECURITY & RIGHTS
              </h4>
              <p>
                We employ SSL encryption across all REST endpoints and WebSockets. You maintain full rights to export or delete your user account and stored channel broadcasts at any time through your Profile dashboard.
              </p>
            </section>
          </div>
        </LegalModal>
      )}

      {/* Cookie Policy Modal */}
      {activeModal === "cookies" && (
        <LegalModal
          title="COOKIE POLICY"
          icon={<Cookie className="h-5 w-5 text-[#e5ff00]" />}
          onClose={closeModal}
        >
          <div className="space-y-4 text-xs font-sans text-zinc-300 leading-relaxed">
            <div className="border border-[#e5ff00]/30 bg-[#e5ff00]/5 p-3 font-mono text-[11px] uppercase text-[#e5ff00]">
              COOKIE & LOCAL STORAGE SPECIFICATION
            </div>

            <section className="space-y-2">
              <h4 className="font-mono text-sm font-bold uppercase text-white tracking-wider">
                1. ESSENTIAL SESSION COOKIES & TOKENS
              </h4>
              <p>
                Sparkz.TV utilizes essential HTTP-only cookies and secure session tokens to keep you safely logged in during live broadcasts, store your authentication credentials, and protect chat interactions against unauthorized forgery.
              </p>
            </section>

            <section className="space-y-2">
              <h4 className="font-mono text-sm font-bold uppercase text-white tracking-wider">
                2. LOCAL STORAGE PREFERENCES
              </h4>
              <p>
                We use browser <code className="bg-zinc-800 px-1 py-0.5 font-mono text-[#e5ff00]">localStorage</code> solely for functional UI states, including:
              </p>
              <ul className="list-disc pl-5 space-y-1 font-mono text-[11px]">
                <li><code className="text-[#e5ff00]">sparkz_sidebar_collapsed</code> — Collapsed state of the live channels sidebar.</li>
                <li><code className="text-[#e5ff00]">sparkz_viewer_token</code> — Anonymous session key for awarding Watts point stream rewards.</li>
                <li>Volume & chat auto-scroll preferences.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h4 className="font-mono text-sm font-bold uppercase text-white tracking-wider">
                3. NO THIRD-PARTY TRACKING COOKIES
              </h4>
              <p>
                Sparkz.TV does not sell advertising profiles or employ intrusive cross-site tracking pixels. Your viewing habits remain confidential.
              </p>
            </section>
          </div>
        </LegalModal>
      )}

      {/* Terms & Conditions Modal */}
      {activeModal === "terms" && (
        <LegalModal
          title="TERMS & CONDITIONS"
          icon={<FileText className="h-5 w-5 text-[#e5ff00]" />}
          onClose={closeModal}
        >
          <div className="space-y-4 text-xs font-sans text-zinc-300 leading-relaxed">
            <div className="border border-[#e5ff00]/30 bg-[#e5ff00]/5 p-3 font-mono text-[11px] uppercase text-[#e5ff00]">
              COMMUNITY BROADCAST & USER AGREEMENT
            </div>

            <section className="space-y-2">
              <h4 className="font-mono text-sm font-bold uppercase text-white tracking-wider">
                1. ACCEPTANCE OF TERMS
              </h4>
              <p>
                By accessing Sparkz.TV, watching streams, or setting up a broadcaster channel, you agree to comply with these terms, community guidelines, and technical streaming requirements.
              </p>
            </section>

            <section className="space-y-2">
              <h4 className="font-mono text-sm font-bold uppercase text-white tracking-wider">
                2. BROADCASTER CONDUCT & CONTENT
              </h4>
              <p>
                Broadcasters are responsible for all media transmitted through their RTMP stream keys and 24-hour story posts. Hate speech, illegal content, non-consensual media, and dangerous exploits are strictly forbidden and will result in permanent channel suspension.
              </p>
            </section>

            <section className="space-y-2">
              <h4 className="font-mono text-sm font-bold uppercase text-white tracking-wider">
                3. INTELLECTUAL PROPERTY & MUSIC
              </h4>
              <p>
                Broadcasters represent that they hold necessary licenses or authorization for music, visual graphics, and sound samples aired on their streams. Sparkz.TV supports independent creators and underground musical culture.
              </p>
            </section>

            <section className="space-y-2">
              <h4 className="font-mono text-sm font-bold uppercase text-white tracking-wider">
                4. SERVICE AVAILABILITY & LIMITATION
              </h4>
              <p>
                Sparkz.TV provides live streaming infrastructure on an "as is" and "as available" basis. We reserve the right to perform routine server maintenance and tune bandwidth allocation.
              </p>
            </section>
          </div>
        </LegalModal>
      )}

      {/* Support Portal Modal */}
      {activeModal === "support" && (
        <LegalModal
          title="SUPPORT & TRANSMISSION HELP"
          icon={<LifeBuoy className="h-5 w-5 text-[#e5ff00]" />}
          onClose={closeModal}
        >
          <div className="space-y-6">
            
            {/* Quick FAQ Accordion / Grid */}
            <div className="space-y-3 border-b border-zinc-800 pb-5">
              <div className="font-mono text-xs uppercase font-bold text-[#e5ff00] tracking-wider flex items-center gap-1.5">
                <HelpCircle className="h-4 w-4" />
                <span>FREQUENTLY ASKED QUESTIONS</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 font-mono text-[11px]">
                <div className="border border-zinc-800 bg-[#0a0a0a] p-3">
                  <div className="font-bold text-white mb-1">// HOW DO I STREAM WITH OBS?</div>
                  <div className="text-zinc-400 font-sans text-xs">
                    Go to your <strong>Dashboard</strong> to retrieve your Server URL and Stream Key. Paste them into OBS Studio under Stream Settings.
                  </div>
                </div>

                <div className="border border-zinc-800 bg-[#0a0a0a] p-3">
                  <div className="font-bold text-white mb-1">// HOW DO 24H STORIES WORK?</div>
                  <div className="text-zinc-400 font-sans text-xs">
                    Click <strong>+ YOUR STORY</strong> on Browse or Directory. Upload a photo or video (up to 50MB). Stories auto-delete after 24 hours.
                  </div>
                </div>

                <div className="border border-zinc-800 bg-[#0a0a0a] p-3">
                  <div className="font-bold text-white mb-1">// WHAT ARE WATTS POINTS?</div>
                  <div className="text-zinc-400 font-sans text-xs">
                    Viewers automatically earn <strong>+10 Watts Points</strong> for every minute of live stream watched to support favorite channels.
                  </div>
                </div>

                <div className="border border-zinc-800 bg-[#0a0a0a] p-3">
                  <div className="font-bold text-white mb-1">// STREAM LATENCY & QUALITY</div>
                  <div className="text-zinc-400 font-sans text-xs">
                    Our AWS IVS engine transcodes high-bitrate video to adaptive streams for seamless playback across desktop & mobile.
                  </div>
                </div>
              </div>
            </div>

            {/* Direct Ticket Contact Form */}
            <div>
              <div className="font-mono text-xs uppercase font-bold text-[#e5ff00] tracking-wider mb-3 flex items-center gap-1.5">
                <Send className="h-4 w-4" />
                <span>SUBMIT A TRANSMISSION SUPPORT TICKET</span>
              </div>

              {submittedSuccess ? (
                <div className="border border-[#e5ff00] bg-[#e5ff00]/10 p-6 text-center space-y-2">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-[#e5ff00]" />
                  <div className="font-mono text-sm font-bold uppercase text-white">
                    TICKET RECEIVED // DISPATCH #SPK-{Math.floor(1000 + Math.random() * 9000)}
                  </div>
                  <p className="font-sans text-xs text-zinc-300">
                    Our engineering team has received your inquiry. We will respond via email shortly.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubmittedSuccess(false)}
                    className="btn-ghost text-xs py-1.5 mt-2"
                  >
                    Send Another Ticket
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSupportSubmit} className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label-caps mb-1 block">// YOUR NAME</label>
                      <input
                        type="text"
                        className="input-terminal w-full"
                        placeholder="DJ / Streamer Name"
                        value={supportName}
                        onChange={(e) => setSupportName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label-caps mb-1 block">// EMAIL ADDRESS *</label>
                      <input
                        type="email"
                        required
                        className="input-terminal w-full"
                        placeholder="your@email.com"
                        value={supportEmail}
                        onChange={(e) => setSupportEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label-caps mb-1 block">// ISSUE CATEGORY</label>
                    <select
                      className="input-terminal w-full bg-[#050505]"
                      value={supportCategory}
                      onChange={(e) => setSupportCategory(e.target.value)}
                    >
                      <option value="general">General Inquiry</option>
                      <option value="stream">Live Ingest & RTMP Issues</option>
                      <option value="stories">24-Hour Stories & Uploads</option>
                      <option value="account">Account & Username Verification</option>
                      <option value="watts">Watts Points & Chat Moderation</option>
                    </select>
                  </div>

                  <div>
                    <label className="label-caps mb-1 block">// MESSAGE / ISSUE DESCRIPTION *</label>
                    <textarea
                      required
                      className="input-terminal w-full h-24 resize-none"
                      placeholder="Describe your question, stream issue, or feedback..."
                      value={supportMessage}
                      onChange={(e) => setSupportMessage(e.target.value)}
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-1">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="btn-ghost py-2 px-4"
                    >
                      CLOSE
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="btn-primary py-2 px-6 font-bold uppercase flex items-center gap-2"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>{submitting ? "SENDING..." : "SUBMIT SUPPORT TICKET"}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </LegalModal>
      )}
    </footer>
  );
}

// Reusable Legal Modal Shell Component
function LegalModal({ title, icon, onClose, children }) {
  return (
    <div
      data-testid="footer-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
    >
      <div className="relative w-full max-w-2xl border border-[#27272a] bg-[#0a0a0a] p-6 shadow-2xl rounded-sm max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#27272a] pb-4 mb-4">
          <div className="flex items-center gap-2.5 font-mono text-sm uppercase font-black tracking-widest text-[#e5ff00]">
            {icon}
            <span>{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {children}
        </div>

        {/* Modal Footer Close */}
        <div className="mt-4 border-t border-[#27272a] pt-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn-primary py-1.5 px-6 font-mono text-xs font-bold uppercase"
          >
            I UNDERSTAND
          </button>
        </div>
      </div>
    </div>
  );
}
