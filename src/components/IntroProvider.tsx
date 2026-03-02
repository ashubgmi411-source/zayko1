"use client";

import React, { useState, useEffect, createContext, useContext } from "react";
import { AnimatePresence } from "framer-motion";
import IntroScreen from "./IntroScreen";

const INTRO_KEY = "zayko_intro_seen";

const IntroContext = createContext({ showIntro: false });

export const useIntro = () => useContext(IntroContext);

export default function IntroProvider({ children }: { children: React.ReactNode }) {
    const [showIntro, setShowIntro] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        // Check localStorage on mount
        const hasSeenIntro = sessionStorage.getItem(INTRO_KEY) || localStorage.getItem(INTRO_KEY);

        if (!hasSeenIntro) {
            setShowIntro(true);
        }
        setIsInitialized(true);
    }, []);

    const handleIntroComplete = () => {
        setShowIntro(false);
        localStorage.setItem(INTRO_KEY, "true");
    };

    // Avoid flash of content while checking storage
    if (!isInitialized) return null;

    return (
        <IntroContext.Provider value={{ showIntro }}>
            <AnimatePresence mode="wait">
                {showIntro && <IntroScreen onComplete={handleIntroComplete} />}
            </AnimatePresence>
            <div style={{ visibility: showIntro ? "hidden" : "visible", height: showIntro ? "100vh" : "auto", overflow: showIntro ? "hidden" : "auto" }}>
                {children}
            </div>
        </IntroContext.Provider>
    );
}
