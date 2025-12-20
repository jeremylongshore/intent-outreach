/**
 * PipelinePilot Landing Page - Interactive Features
 * Handles modals, smooth scrolling, and user interactions
 */

(function() {
  'use strict';

  // ============================================
  // MODAL MANAGEMENT
  // ============================================

  /**
   * Show the status modal
   * @param {string} modalId - ID of the modal to show (default: 'statusModal')
   */
  window.showStatusModal = function(modalId = 'statusModal') {
    const modal = document.getElementById(modalId);
    if (!modal) {
      console.error(`Modal with ID "${modalId}" not found`);
      return;
    }

    // Show modal
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    // Focus first focusable element in modal
    const firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable) {
      setTimeout(() => firstFocusable.focus(), 100);
    }

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Log event for analytics (if analytics integration added later)
    console.log('Modal opened:', modalId);
  };

  /**
   * Hide the status modal
   * @param {string} modalId - ID of the modal to hide (default: 'statusModal')
   */
  window.hideStatusModal = function(modalId = 'statusModal') {
    const modal = document.getElementById(modalId);
    if (!modal) {
      console.error(`Modal with ID "${modalId}" not found`);
      return;
    }

    // Hide modal
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');

    // Restore body scroll
    document.body.style.overflow = '';

    // Log event for analytics
    console.log('Modal closed:', modalId);
  };

  // ============================================
  // KEYBOARD NAVIGATION
  // ============================================

  /**
   * Handle global keyboard events
   */
  document.addEventListener('keydown', function(event) {
    // ESC key closes modals
    if (event.key === 'Escape' || event.keyCode === 27) {
      const visibleModal = document.querySelector('[id$="Modal"]:not(.hidden)');
      if (visibleModal) {
        const modalId = visibleModal.getAttribute('id');
        window.hideStatusModal(modalId);
      }
    }
  });

  // ============================================
  // SMOOTH SCROLL FOR ANCHOR LINKS
  // ============================================

  /**
   * Enhanced smooth scroll for internal anchor links
   */
  function initSmoothScroll() {
    // Get all links with href starting with #
    const anchorLinks = document.querySelectorAll('a[href^="#"]');

    anchorLinks.forEach(link => {
      link.addEventListener('click', function(event) {
        const href = this.getAttribute('href');

        // Ignore empty hash or just "#"
        if (!href || href === '#') {
          event.preventDefault();
          return;
        }

        // Get target element
        const targetId = href.substring(1);
        const targetElement = document.getElementById(targetId);

        if (targetElement) {
          event.preventDefault();

          // Scroll to target with offset for fixed header
          const headerOffset = 80; // Adjust based on header height
          const elementPosition = targetElement.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });

          // Update URL hash without jumping
          if (history.pushState) {
            history.pushState(null, null, href);
          }

          // Focus target for accessibility
          targetElement.setAttribute('tabindex', '-1');
          targetElement.focus();
        }
      });
    });
  }

  // ============================================
  // MODAL BACKDROP CLICK
  // ============================================

  /**
   * Close modal when clicking backdrop
   */
  function initModalBackdropClick() {
    const modals = document.querySelectorAll('[id$="Modal"]');

    modals.forEach(modal => {
      modal.addEventListener('click', function(event) {
        // Only close if clicking the backdrop itself, not modal content
        if (event.target === modal) {
          const modalId = modal.getAttribute('id');
          window.hideStatusModal(modalId);
        }
      });
    });
  }

  // ============================================
  // SCROLL REVEAL ANIMATIONS
  // ============================================

  /**
   * Reveal elements on scroll (optional enhancement)
   */
  function initScrollReveal() {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          // Optional: unobserve after revealing
          // observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    // Observe elements with data-reveal attribute
    const revealElements = document.querySelectorAll('[data-reveal]');
    revealElements.forEach(el => observer.observe(el));
  }

  // ============================================
  // COPY TO CLIPBOARD
  // ============================================

  /**
   * Copy text to clipboard utility
   * @param {string} text - Text to copy
   * @param {HTMLElement} button - Button that triggered the copy (optional)
   */
  window.copyToClipboard = function(text, button) {
    // Use modern Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => {
          console.log('Copied to clipboard:', text);
          showCopyFeedback(button);
        })
        .catch(err => {
          console.error('Failed to copy:', err);
          fallbackCopy(text, button);
        });
    } else {
      // Fallback for older browsers
      fallbackCopy(text, button);
    }
  };

  /**
   * Show visual feedback after copying
   * @param {HTMLElement} button - Button element
   */
  function showCopyFeedback(button) {
    if (!button) return;

    const originalText = button.textContent;
    button.textContent = 'Copied!';
    button.classList.add('bg-green-600');

    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('bg-green-600');
    }, 2000);
  }

  /**
   * Fallback copy method for older browsers
   * @param {string} text - Text to copy
   * @param {HTMLElement} button - Button element
   */
  function fallbackCopy(text, button) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();

    try {
      document.execCommand('copy');
      console.log('Copied to clipboard (fallback):', text);
      showCopyFeedback(button);
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }

    document.body.removeChild(textarea);
  }

  // ============================================
  // EXTERNAL LINK HANDLING
  // ============================================

  /**
   * Add target="_blank" and rel="noopener noreferrer" to external links
   */
  function initExternalLinks() {
    const links = document.querySelectorAll('a[href^="http"]');

    links.forEach(link => {
      // Check if link is external
      const isExternal = !link.href.includes(window.location.hostname);

      if (isExternal) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');

        // Add aria-label for accessibility
        const ariaLabel = link.getAttribute('aria-label') || link.textContent;
        link.setAttribute('aria-label', `${ariaLabel} (opens in new tab)`);
      }
    });
  }

  // ============================================
  // TOOLTIP SUPPORT (OPTIONAL)
  // ============================================

  /**
   * Initialize tooltips for elements with data-tooltip attribute
   */
  function initTooltips() {
    const tooltipElements = document.querySelectorAll('[data-tooltip]');

    tooltipElements.forEach(element => {
      const tooltipText = element.getAttribute('data-tooltip');
      if (!tooltipText) return;

      // Create tooltip element
      const tooltip = document.createElement('div');
      tooltip.className = 'tooltip-popup hidden absolute z-50 px-3 py-2 text-sm bg-slate-800 text-white rounded-lg shadow-lg';
      tooltip.textContent = tooltipText;
      tooltip.setAttribute('role', 'tooltip');

      document.body.appendChild(tooltip);

      // Show on hover
      element.addEventListener('mouseenter', () => {
        const rect = element.getBoundingClientRect();
        tooltip.style.top = `${rect.top - tooltip.offsetHeight - 8}px`;
        tooltip.style.left = `${rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2)}px`;
        tooltip.classList.remove('hidden');
      });

      // Hide on leave
      element.addEventListener('mouseleave', () => {
        tooltip.classList.add('hidden');
      });
    });
  }

  // ============================================
  // SCROLL TO TOP BUTTON (OPTIONAL)
  // ============================================

  /**
   * Show/hide scroll to top button based on scroll position
   */
  function initScrollToTop() {
    const scrollBtn = document.getElementById('scrollToTop');
    if (!scrollBtn) return;

    window.addEventListener('scroll', () => {
      if (window.pageYOffset > 300) {
        scrollBtn.classList.remove('hidden');
      } else {
        scrollBtn.classList.add('hidden');
      }
    });

    scrollBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }

  // ============================================
  // FORM VALIDATION (OPTIONAL)
  // ============================================

  /**
   * Basic form validation for beta signup forms
   */
  function initFormValidation() {
    const forms = document.querySelectorAll('form[data-validate]');

    forms.forEach(form => {
      form.addEventListener('submit', function(event) {
        const email = form.querySelector('input[type="email"]');

        if (email && !isValidEmail(email.value)) {
          event.preventDefault();
          showFormError(email, 'Please enter a valid email address');
        }
      });
    });
  }

  /**
   * Validate email format
   * @param {string} email - Email address
   * @returns {boolean}
   */
  function isValidEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  /**
   * Show form validation error
   * @param {HTMLElement} input - Input element
   * @param {string} message - Error message
   */
  function showFormError(input, message) {
    const error = document.createElement('div');
    error.className = 'text-red-400 text-sm mt-2';
    error.textContent = message;

    // Remove existing error
    const existingError = input.parentElement.querySelector('.text-red-400');
    if (existingError) {
      existingError.remove();
    }

    input.parentElement.appendChild(error);
    input.classList.add('border-red-500');

    // Remove error on input
    input.addEventListener('input', function() {
      error.remove();
      input.classList.remove('border-red-500');
    }, { once: true });
  }

  // ============================================
  // ANALYTICS INTEGRATION (PLACEHOLDER)
  // ============================================

  /**
   * Track events (placeholder for future analytics integration)
   * @param {string} category - Event category
   * @param {string} action - Event action
   * @param {string} label - Event label
   */
  window.trackEvent = function(category, action, label) {
    console.log('Event tracked:', { category, action, label });

    // Example: Google Analytics integration
    // if (window.gtag) {
    //   gtag('event', action, {
    //     'event_category': category,
    //     'event_label': label
    //   });
    // }

    // Example: Mixpanel integration
    // if (window.mixpanel) {
    //   mixpanel.track(action, {
    //     category: category,
    //     label: label
    //   });
    // }
  };

  // ============================================
  // INITIALIZATION
  // ============================================

  /**
   * Initialize all interactive features when DOM is ready
   */
  function init() {
    console.log('PipelinePilot site.js initialized');

    // Core features
    initSmoothScroll();
    initModalBackdropClick();
    initExternalLinks();

    // Optional enhancements
    initScrollReveal();
    initTooltips();
    initScrollToTop();
    initFormValidation();

    // Log ready state
    console.log('All interactive features loaded');
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
