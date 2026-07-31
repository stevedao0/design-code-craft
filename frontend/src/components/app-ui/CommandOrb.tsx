import React from 'react';
import vcpmcLogo from '../../assets/vcpmc-logo-animated.webp';

interface CommandOrbProps {
  onClick: () => void;
  isOpen: boolean;
  title?: string;
}

/**
 * CommandOrb — the ONLY place the VCPMC logo asset is rendered in the rail.
 *
 * It renders the exact same official brand mark used on the login screen
 * (assets/vcpmc-logo-animated.webp) inside a round white badge with a thin
 * brand ring — matching vcpmc.org, where the seal sits in a white circle.
 * No CSS mask recolouring, no red silhouette, no glow.
 */
export function CommandOrb({ onClick, isOpen, title = 'VCPMC Command Center' }: CommandOrbProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`vcpmc-orb ${isOpen ? 'is-open' : ''}`}
      aria-label={title}
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      title={title}
    >
      <img className="vcpmc-orb__logo" src={vcpmcLogo} alt="" aria-hidden draggable={false} />
    </button>
  );
}