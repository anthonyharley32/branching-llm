/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // Scan relevant files for Tailwind classes
  ],
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
        // Dark mode typography
        invert: {
          css: {
            '--tw-prose-body': theme('colors.gray.300'),
            '--tw-prose-headings': theme('colors.white'),
            '--tw-prose-lead': theme('colors.gray.400'),
            '--tw-prose-links': theme('colors.blue.400'),
            '--tw-prose-bold': theme('colors.white'),
            '--tw-prose-counters': theme('colors.gray.400'),
            '--tw-prose-bullets': theme('colors.gray.600'),
            '--tw-prose-hr': theme('colors.gray.700'),
            '--tw-prose-quotes': theme('colors.gray.100'),
            '--tw-prose-quote-borders': theme('colors.gray.700'),
            '--tw-prose-captions': theme('colors.gray.400'),
            '--tw-prose-code': theme('colors.white'),
            '--tw-prose-pre-code': theme('colors.gray.300'),
            '--tw-prose-pre-bg': theme('colors.gray.900'),
            '--tw-prose-th-borders': theme('colors.gray.600'),
            '--tw-prose-td-borders': theme('colors.gray.700'),
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