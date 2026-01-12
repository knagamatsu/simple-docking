import React from "react";
import "./StickyFooter.css";
import { ChevronLeftIcon, ChevronRightIcon } from "./Icons";

export default function StickyFooter({
    onBack,
    onNext,
    nextLabel = "Next",
    backLabel = "Back",
    nextDisabled = false,
    showBack = true,
    showNext = true,
    children
}) {
    return (
        <div className="sticky-footer-placeholder">
            <div className="sticky-footer">
                <div className="sticky-footer-content">
                    <div className="footer-left">
                        {showBack && (
                            <button
                                type="button"
                                className="button-text"
                                onClick={onBack}
                            >
                                <ChevronLeftIcon size={16} /> {backLabel}
                            </button>
                        )}
                    </div>

                    <div className="footer-center">
                        {children}
                    </div>

                    <div className="footer-right">
                        {showNext && (
                            <button
                                type="button"
                                className="primary"
                                onClick={onNext}
                                disabled={nextDisabled}
                            >
                                {nextLabel} <ChevronRightIcon size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
