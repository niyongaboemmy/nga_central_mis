import React from "react";

interface AboutUsProps {
  onNavigateBack: () => void;
}

const AboutUs: React.FC<AboutUsProps> = ({ onNavigateBack }) => {
  const teamMembers = [
    {
      name: "John Smith",
      role: "Project Manager",
      bio: "Over 15 years of experience in managing enterprise software projects.",
    },
    {
      name: "Sarah Johnson",
      role: "Lead Developer",
      bio: "Full-stack developer with expertise in modern web technologies.",
    },
    {
      name: "Michael Brown",
      role: "UI/UX Designer",
      bio: "Creating intuitive and beautiful user experiences for over 10 years.",
    },
    {
      name: "Emily Davis",
      role: "QA Engineer",
      bio: "Ensuring software quality with comprehensive testing strategies.",
    },
  ];

  const values = [
    {
      icon: (
        <svg
          className="w-10 h-10"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
      ),
      title: "Security First",
      description: "We prioritize the security of your data above all else.",
    },
    {
      icon: (
        <svg
          className="w-10 h-10"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      ),
      title: "Innovation",
      description:
        "Constantly evolving to bring you the latest technology solutions.",
    },
    {
      icon: (
        <svg
          className="w-10 h-10"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      ),
      title: "User-Centric",
      description: "Every feature is designed with our users' needs in mind.",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-background-light to-indigo-50 dark:from-background-dark dark:via-background-dark dark:to-background-dark">
      {/* Hero Section */}
      <section className="pt-28 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-text-primary-light dark:text-text-primary-dark mb-6">
              About Us
            </h1>
            <p className="text-xl text-text-secondary-light dark:text-text-secondary-dark max-w-3xl mx-auto">
              We are dedicated to transforming how organizations manage their
              operations through innovative technology solutions.
            </p>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-surface-light dark:bg-surface-dark">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-text-primary-light dark:text-text-primary-dark mb-6">
                Our Mission
              </h2>
              <p className="text-lg text-text-secondary-light dark:text-text-secondary-dark mb-6">
                At NGA Central MIS, our mission is to empower organizations with
                comprehensive management solutions that streamline operations,
                enhance productivity, and drive informed decision-making.
              </p>
              <p className="text-lg text-text-secondary-light dark:text-text-secondary-dark mb-6">
                We believe that effective management information systems are the
                backbone of successful organizations. Our team works tirelessly
                to deliver solutions that are not just functional, but
                transformative.
              </p>
              <p className="text-lg text-text-secondary-light dark:text-text-secondary-dark">
                Since our inception, we have helped countless organizations
                achieve their goals through technology, and we continue to
                innovate and expand our offerings to meet the evolving needs of
                modern businesses.
              </p>
            </div>
            <div className="relative">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-8 shadow-2xl">
                <div className="grid grid-cols-2 gap-6">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-white mb-2">
                      500+
                    </div>
                    <div className="text-blue-100">Clients</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-bold text-white mb-2">
                      10M+
                    </div>
                    <div className="text-blue-100">Users</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-bold text-white mb-2">
                      99.9%
                    </div>
                    <div className="text-blue-100">Uptime</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-bold text-white mb-2">
                      24/7
                    </div>
                    <div className="text-blue-100">Support</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-text-primary-light dark:text-text-primary-dark mb-4">
              Our Values
            </h2>
            <p className="text-lg text-text-secondary-light dark:text-text-secondary-dark max-w-2xl mx-auto">
              The principles that guide everything we do
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {values.map((value, index) => (
              <div
                key={index}
                className="bg-card-light dark:bg-card-dark rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 border border-border-light dark:border-border-dark text-center"
              >
                <div className="w-20 h-20 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <div className="text-blue-600 dark:text-blue-400">
                    {value.icon}
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-text-primary-light dark:text-text-primary-dark mb-3">
                  {value.title}
                </h3>
                <p className="text-text-secondary-light dark:text-text-secondary-dark">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-surface-light dark:bg-surface-dark">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-text-primary-light dark:text-text-primary-dark mb-4">
              Meet Our Team
            </h2>
            <p className="text-lg text-text-secondary-light dark:text-text-secondary-dark max-w-2xl mx-auto">
              The passionate professionals behind NGA Central MIS
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {teamMembers.map((member, index) => (
              <div
                key={index}
                className="bg-card-light dark:bg-card-dark rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 border border-border-light dark:border-border-dark text-center"
              >
                <div className="w-24 h-24 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <span className="text-3xl font-bold text-white">
                    {member.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-text-primary-light dark:text-text-primary-dark mb-1">
                  {member.name}
                </h3>
                <p className="text-blue-600 dark:text-blue-400 text-sm mb-3">
                  {member.role}
                </p>
                <p className="text-text-secondary-light dark:text-text-secondary-dark text-sm">
                  {member.bio}
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

export default AboutUs;
