import React, { useState } from "react";
import { Button, Input, Alert } from "./ui";

interface ContactUsProps {
  onNavigateBack: () => void;
}

const ContactUs: React.FC<ContactUsProps> = ({ onNavigateBack }) => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

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
      icon: (
        <svg
          className="w-8 h-8"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      ),
      title: "Email",
      value: "support@ngacentralmis.com",
    },
    {
      icon: (
        <svg
          className="w-8 h-8"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
          />
        </svg>
      ),
      title: "Phone",
      value: "+1 (555) 123-4567",
    },
    {
      icon: (
        <svg
          className="w-8 h-8"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
      title: "Address",
      value: "123 Business Ave, Suite 100, New York, NY 10001",
    },
  ];

  const faqs = [
    {
      question: "How do I get started with NGA Central MIS?",
      answer:
        "Simply click the 'Sign In' button and create an account. Our onboarding process will guide you through the setup.",
    },
    {
      question: "Is there a free trial available?",
      answer:
        "Yes, we offer a 14-day free trial with full access to all features. No credit card required.",
    },
    {
      question: "What support options are available?",
      answer:
        "We offer 24/7 email support, live chat during business hours, and dedicated phone support for enterprise customers.",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-background-light to-indigo-50 dark:from-background-dark dark:via-background-dark dark:to-background-dark">
      {/* Hero Section */}
      <section className="pt-28 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-text-primary-light dark:text-text-primary-dark mb-6">
              Contact Us
            </h1>
            <p className="text-xl text-text-secondary-light dark:text-text-secondary-dark max-w-3xl mx-auto">
              Have questions? We're here to help. Reach out to us through any of
              the channels below.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Info & Form Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-surface-light dark:bg-surface-dark">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Contact Info */}
            <div className="lg:col-span-1 space-y-6">
              {contactInfo.map((info, index) => (
                <div
                  key={index}
                  className="bg-card-light dark:bg-card-dark rounded-2xl p-6 shadow-lg border border-border-light dark:border-border-dark"
                >
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 rounded-xl flex items-center justify-center mb-4">
                    <div className="text-blue-600 dark:text-blue-400">
                      {info.icon}
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-text-primary-light dark:text-text-primary-dark mb-1">
                    {info.title}
                  </h3>
                  <p className="text-text-secondary-light dark:text-text-secondary-dark">
                    {info.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Contact Form */}
            <div className="lg:col-span-2">
              <div className="bg-card-light dark:bg-card-dark rounded-2xl p-8 shadow-lg border border-border-light dark:border-border-dark">
                <h2 className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark mb-6">
                  Send us a Message
                </h2>

                {submitted ? (
                  <div className="text-center py-12">
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
                    <h3 className="text-2xl font-semibold text-text-primary-light dark:text-text-primary-dark mb-2">
                      Message Sent!
                    </h3>
                    <p className="text-text-secondary-light dark:text-text-secondary-dark mb-6">
                      Thank you for reaching out. We'll get back to you within
                      24 hours.
                    </p>
                    <Button
                      onClick={() => setSubmitted(false)}
                      className="px-6"
                    >
                      Send Another Message
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Input
                        type="text"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        placeholder="Your Name"
                        label="Name"
                        required
                      />
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        placeholder="your@email.com"
                        label="Email"
                        required
                      />
                    </div>
                    <Input
                      type="text"
                      value={formData.subject}
                      onChange={(e) =>
                        setFormData({ ...formData, subject: e.target.value })
                      }
                      placeholder="What's this about?"
                      label="Subject"
                      required
                    />
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
                        Message
                      </label>
                      <textarea
                        value={formData.message}
                        onChange={(e) =>
                          setFormData({ ...formData, message: e.target.value })
                        }
                        placeholder="Tell us how we can help you..."
                        rows={5}
                        className="w-full px-4 py-3 border-2 border-border-light dark:border-border-dark rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark text-text-primary-light dark:text-text-primary-dark resize-none"
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full py-4"
                      disabled={loading}
                    >
                      {loading ? (
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                          Sending...
                        </div>
                      ) : (
                        "Send Message"
                      )}
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-text-primary-light dark:text-text-primary-dark mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-text-secondary-light dark:text-text-secondary-dark max-w-2xl mx-auto">
              Quick answers to common questions
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="bg-card-light dark:bg-card-dark rounded-2xl p-8 shadow-lg border border-border-light dark:border-border-dark"
              >
                <h3 className="text-lg font-semibold text-text-primary-light dark:text-text-primary-dark mb-3">
                  {faq.question}
                </h3>
                <p className="text-text-secondary-light dark:text-text-secondary-dark">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Back Button */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <button
            onClick={onNavigateBack}
            className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-full transition-all duration-200"
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
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-surface-light dark:bg-surface-dark py-12 px-4 sm:px-6 lg:px-8 border-t border-border-light dark:border-border-dark">
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <img
              src="/logo.svg"
              alt="NGA Central MIS"
              className="w-8 h-8 rounded-full"
            />
            <span className="font-semibold text-text-primary-light dark:text-text-primary-dark">
              NGA Central MIS
            </span>
          </div>
          <p className="text-text-secondary-light dark:text-text-secondary-dark">
            © 2024 NGA Central MIS. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default ContactUs;
