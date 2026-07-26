import flowbite from "flowbite/plugin";

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./public/**/*.{html,js}",
        "./node_modules/flowbite/**/*.js",
    ],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: "#1677FF",
                    hover: "#2F81F7",
                    light: "#4DA3FF",
                },
                background: "#0D1117",
                surface: "#161B22",
                sidebar: "#111827",
                card: "#1C2128",
                border: "#30363D",
                muted: "#9CA3AF",
                success: "#16C784",
                warning: "#F59E0B",
                danger: "#EF4444",
                info: "#3B82F6",
            },
            fontFamily: {
                sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
                mono: ["JetBrains Mono", "Fira Code", "monospace"],
            },
            boxShadow: {
                glow: "0 0 40px -10px rgba(22, 119, 255, 0.35)",
                card: "0 8px 32px rgba(0, 0, 0, 0.4)",
            },
            animation: {
                "fade-in": "fadeIn 0.3s ease-out",
                "slide-up": "slideUp 0.3s ease-out",
                shimmer: "shimmer 1.5s infinite",
            },
            keyframes: {
                fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
                slideUp: { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
                shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
            },
        },
    },
    plugins: [flowbite],
};
