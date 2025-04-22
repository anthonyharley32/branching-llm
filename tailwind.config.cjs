/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // Scan relevant files for Tailwind classes
  ],
  darkMode: false, // Disable dark mode
  theme: {
    extend: {
      typography: ({ theme }) => ({
        DEFAULT: {
          css: {
            // --- Customize Horizontal Rules (HR) ---
            hr: {
              borderColor: theme('colors.gray.200', '#e5e7eb'), // Lighter border color
              borderTopWidth: '1px',
              marginTop: '2em', // More space above
              marginBottom: '2em', // More space below
            },
            // --- Ensure headings have good spacing and sizes (defaults are usually okay, but can tweak here) ---
            // Example: Slightly larger H1/H2
            h1: {
              fontSize: theme('fontSize.4xl'), // Larger
              marginBottom: theme('spacing.6'), // More space below
            },
            h2: {
              fontSize: theme('fontSize.3xl'), // Larger
              marginBottom: theme('spacing.5'), // More space below
            },
            h3: {
              fontSize: theme('fontSize.2xl'),
              marginBottom: theme('spacing.4'),
            },
            h4: {
              fontSize: theme('fontSize.xl'),
              marginBottom: theme('spacing.4'),
            },
            h5: {
              fontSize: theme('fontSize.lg'),
              marginBottom: theme('spacing.3'),
            },
            h6: {
              fontSize: theme('fontSize.base'),
              marginBottom: theme('spacing.3'),
            },
            // --- Add more customizations as needed ---
          },
        },
      }),
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    // Add other plugins here if you use them
  ],
}; 