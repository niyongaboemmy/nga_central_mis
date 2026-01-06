import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Input, Alert } from "./ui";
import { MdEmail, MdPhone, MdLocationOn } from "react-icons/md";
import {
  FaCommentDots,
  FaPaperPlane,
  FaQuestion,
  FaChevronDown,
} from "react-icons/fa";

interface ContactUsProps {
  onNavigateBack: () => void;
}

// Animated floating particles
const FloatingParticles = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    {[...Array(10)].map((_, i) => (
      <motion.div
        key={i}
        initial={{
          opacity: 0,
          x: Math.random() * window.innerWidth,
          y: window.innerHeight + 50,
        }}
        animate={{
          opacity: [0, 1, 0],
          y: -100,
        }}
        transition={{
          repeat: Infinity,
          duration: 10 + Math.random() * 10,
          delay: Math.random() * 10,
          ease: "linear",
        }}
        className="absolute"
        style={{
          left: `${Math.random() * 100}%`,
        }}
      >
        <div className="w-2 h-2 bg-blue-400 rounded-full" />
      </motion.div>
    ))}
  </div>
);

// Animated background shapes
const BackgroundShapes = () => (
  <>
    <motion.div
      animate={{
        y: [0, -30, 0],
        x: [0, 20, 0],
        scale: [1, 1.2, 1],
      }}
      transition={{ repeat: Infinity, duration: 10, ease: "easeInOut" }}
      className="absolute top-20 left-[5%] w-80 h-80 bg-blue-200/20 rounded-full blur-3xl"
    />
    <motion.div
      animate={{
        y: [0, 40, 0],
        x: [0, -20, 0],
        scale: [1, 1.3, 1],
      }}
      transition={{
        repeat: Infinity,
        duration: 12,
        ease: "easeInOut",
        delay: 1,
      }}
      className="absolute bottom-40 right-[5%] w-[400px] h-[400px] bg-blue-200/20 rounded-full blur-3xl"
    />
  </>
);

// Contact info card
const ContactInfoCard = ({
  icon,
  title,
  value,
  delay,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  delay: number;
  color: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    whileHover={{ scale: 1.02, y: -5 }}
    className="group bg-white/80 dark:bg-slate-800/40 backdrop-blur-sm rounded-3xl p-6 shadow-lg border border-white dark:border-slate-700/30"
  >
    <div className="flex items-center gap-4">
      <div>
        <div
          className={`w-14 h-14 bg-gradient-to-br ${color} text-white rounded-xl flex items-center justify-center shadow-lg`}
        >
          {icon}
        </div>
      </div>
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </h3>
        <p className="text-gray-600 dark:text-gray-300">{value}</p>
      </div>
    </div>
  </motion.div>
);

const ContactUs: React.FC<ContactUsProps> = ({ onNavigateBack }) => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Simulate form submission
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setSubmitted(true);
    setLoading(false);
    setFormData({ name: "", email: "", subject: "", message: "" });
  };

  const contactInfo = [
    {
      icon: <MdEmail className="w-6 h-6" />,
      title: "Email",
      value: "support@ngacentralmis.com",
      color: "from-blue-500 to-blue-600",
    },
    {
      icon: <MdPhone className="w-6 h-6" />,
      title: "Phone",
      value: "+1 (555) 123-4567",
      color: "from-green-500 to-green-600",
    },
    {
      icon: <MdLocationOn className="w-6 h-6" />,
      title: "Address",
      value: "123 Education Ave, Suite 100",
      color: "from-amber-500 to-amber-600",
    },
  ];

  const faqs = [
    {
      question: "How do I create and manage student accounts?",
      answer:
        "Administrators can easily add new students through the Dashboard > Students section. You can import bulk student data via CSV, assign unique IDs, and manage enrollment status all in one place.",
    },
    {
      question: "How do I track student performance and grades?",
      answer:
        "Navigate to the Results section to record and monitor grades. The platform supports continuous assessment, semester grades, and automatic GPA calculations. You can generate detailed performance reports for individual students or entire classes.",
    },
    {
      question: "How do I generate reports and analytics?",
      answer:
        "The Reports section offers comprehensive analytics including enrollment statistics, attendance rates, grade distributions, and financial reports. Export data in PDF, Excel, or CSV formats for further analysis.",
    },
    {
      question: "Can parents and students access the portal?",
      answer:
        "Yes! Students and parents have dedicated portal access to view grades, attendance records, fee balances, and school announcements. Access credentials are managed by administrators.",
    },
    {
      question: "How do I manage staff and instructor accounts?",
      answer:
        "Go to Staff Management to add teachers and administrative personnel. You can assign roles, set permissions, assign class responsibilities, and manage schedules from one central dashboard.",
    },
    {
      question: "Is my data secure and backed up?",
      answer:
        "Absolutely. We use industry-standard encryption to protect all data. Automatic daily backups ensure your information is safe. All data is stored in secure, compliant cloud infrastructure.",
    },
    {
      question: "How do I handle fee payments and financial records?",
      answer:
        "The Finance module manages fee structures, payment tracking, receipts, and financial reports. Parents can make payments through the portal, and administrators can track all transactions in real-time.",
    },
    {
      question: "How do I reset my password or recover my account?",
      answer:
        "Click 'Forgot Password' on the login page and enter your registered email. You'll receive a verification code to reset your password. For account recovery, contact your system administrator.",
    },
    {
      question: "Can I access the platform on mobile devices?",
      answer:
        "Yes! The platform is fully responsive and works on smartphones and tablets. We also offer dedicated mobile apps for iOS and Android with push notifications for important updates.",
    },
    {
      question: "How do I contact technical support?",
      answer:
        "You can reach our support team via email at support@ngacentralmis.com, call us at +1 (555) 123-4567, or use the contact form above. Enterprise clients get dedicated support representatives.",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-slate-950 overflow-hidden relative">
      <FloatingParticles />
      <BackgroundShapes />

      {/* Hero Section */}
      <section className="relative z-10 pt-40 pb-20 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-block px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-sm font-medium mb-4"
            >
              Get in Touch
            </motion.span>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6"
            >
              We'd Love to{" "}
              <span className="bg-gradient-to-r from-blue-600 via-blue-400 to-blue-600 bg-clip-text text-transparent">
                Hear From You
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto"
            >
              Have questions? Our team is here to help you succeed.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Contact Info & Form Section */}
      <section className="relative z-10 py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-8 mb-16">
            {contactInfo.map((info, index) => (
              <ContactInfoCard
                key={index}
                icon={info.icon}
                title={info.title}
                value={info.value}
                delay={index * 0.1}
                color={info.color}
              />
            ))}
          </div>

          {/* Contact Form */}
          <div className="max-w-2xl mx-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="bg-white/80 dark:bg-slate-800/30 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-white dark:border-slate-700/20"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                className="text-center mb-8"
              >
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <FaCommentDots className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Send us a Message
                </h2>
                <p className="text-gray-600 dark:text-gray-300">
                  We'll get back to you within 24 hours
                </p>
              </motion.div>

              {submitted ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-12"
                >
                  <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg
                      className="w-10 h-10 text-green-600 dark:text-green-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                    Message Sent! ✓
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-6">
                    Thank you for reaching out. We'll get back to you soon!
                  </p>
                  <Button onClick={() => setSubmitted(false)} className="px-8">
                    Send Another Message
                  </Button>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                    >
                      <Input
                        type="text"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        placeholder="Your Name"
                        label=""
                        required
                      />
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        placeholder="your@email.com"
                        label=""
                        required
                      />
                    </motion.div>
                  </div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <Input
                      type="text"
                      value={formData.subject}
                      onChange={(e) =>
                        setFormData({ ...formData, subject: e.target.value })
                      }
                      placeholder="What's this about?"
                      label=""
                      required
                    />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="space-y-2"
                  >
                    <textarea
                      value={formData.message}
                      onChange={(e) =>
                        setFormData({ ...formData, message: e.target.value })
                      }
                      placeholder="Tell us how we can help you..."
                      rows={5}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-white dark:bg-slate-800/30 text-gray-900 dark:text-white resize-none"
                      required
                    />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <Button
                      type="submit"
                      className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700"
                      disabled={loading}
                    >
                      {loading ? (
                        <div className="flex items-center justify-center">
                          <motion.div
                            className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              ease: "linear",
                            }}
                          />
                          Sending...
                        </div>
                      ) : (
                        <span className="flex items-center justify-center">
                          Send Message <FaPaperPlane className="w-4 h-4 ml-2" />
                        </span>
                      )}
                    </Button>
                  </motion.div>
                </form>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="relative z-10 py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              className="inline-block px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-sm font-medium mb-4"
            >
              Common Questions
            </motion.span>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Frequently Asked Questions
            </h2>
          </motion.div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white/80 dark:bg-slate-800/40 backdrop-blur-sm rounded-2xl shadow-md border border-white dark:border-slate-700/30 overflow-hidden"
              >
                <button
                  onClick={() =>
                    setOpenFaqIndex(openFaqIndex === index ? null : index)
                  }
                  className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-slate-700/20 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <FaQuestion className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white pr-4">
                      {faq.question}
                    </h3>
                  </div>
                  <motion.div
                    animate={{ rotate: openFaqIndex === index ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex-shrink-0"
                  >
                    <FaChevronDown className="w-5 h-5 text-gray-400" />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {openFaqIndex === index && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                    >
                      <div className="px-6 pb-6 pl-[5.5rem]">
                        <Alert
                          type="info"
                          message={faq.answer}
                          className="bg-blue-50 dark:bg-blue-900/20 border-blue-400 text-blue-800 dark:text-blue-200 shadow-sm"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Back Button */}
      <section className="relative z-10 py-16 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <motion.button
            onClick={onNavigateBack}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex items-center px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 text-white font-semibold rounded-full shadow-lg shadow-blue-500/25 transition-all"
          >
            <svg
              className="w-5 h-5 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to Home
          </motion.button>
        </div>
      </section>
    </div>
  );
};

export default ContactUs;
