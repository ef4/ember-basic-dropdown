import Ember from 'ember';
import layout from '../templates/components/basic-dropdown';
import getOwner from 'ember-getowner-polyfill';
import config from 'ember-get-config';
import { currentTransform } from 'ember-basic-dropdown/matrix';

const { Component, run, computed } = Ember;
const MutObserver = self.window.MutationObserver || self.window.WebKitMutationObserver;
const defaultDestination = config['ember-basic-dropdown'] && config['ember-basic-dropdown'].destination || 'ember-basic-dropdown-wormhole';

export default Component.extend({
  layout: layout,
  disabled: false,
  renderInPlace: false,
  role: 'button',
  destination: null,
  verticalPosition: 'auto', // above | below
  horizontalPosition: 'auto', // right | left
  classNames: ['ember-basic-dropdown'],
  attributeBindings: ['dir'],
  classNameBindings: ['renderInPlace:ember-basic-dropdown--in-place', '_verticalPositionClass', '_horizontalPositionClass'],

  // Lifecycle hooks
  init() {
    this._super(...arguments);
    this.handleRootMouseDown = this.handleRootMouseDown.bind(this);
    this.handleRepositioningEvent = this.handleRepositioningEvent.bind(this);
    this.repositionDropdown = this.repositionDropdown.bind(this);
  },

  didInitAttrs() {
    this._super(...arguments);
    const registerActionsInParent = this.get('registerActionsInParent');
    if (registerActionsInParent) {
      registerActionsInParent(this.get('publicAPI'));
    }
  },

  willDestroy() {
    this._super(...arguments);
    if (this.get('publicAPI.isOpen')) {
      this.removeGlobalEvents();
    }
  },

  // CPs
  appRoot: computed(function() {
    const rootSelector = Ember.testing ? '#ember-testing' : getOwner(this).lookup('application:main').rootElement;
    return self.document.querySelector(rootSelector);
  }),

  wormholeDestination: computed('destination', function() {
    return Ember.testing ? 'ember-testing' : (this.get('destination') || defaultDestination);
  }),

  dropdownId: computed(function() {
    return `ember-basic-dropdown-content-${this.elementId}`;
  }),

  tabIndex: computed('disabled', function() {
    return !this.get('disabled') ? (this.get('tabindex') || '0') : null;
  }),

  publicAPI: computed(function() {
    return {
      isOpen: false,
      actions: {
        open: this.open.bind(this),
        close: this.close.bind(this),
        toggle: this.toggle.bind(this),
        reposition: this.handleRepositioningEvent.bind(this)
      }
    };
  }),

  opened: computed('publicAPI.isOpen', {
    get() { return this.get('publicAPI.isOpen'); },
    set(_, newOpened) {
      const oldOpened = this.get('publicAPI.isOpen');
      if (!oldOpened && newOpened) {
        this.open();
      } else if (oldOpened && !newOpened) {
        this.close();
      }
      return this.get('publicAPI.isOpen');
    }
  }),

  // Actions
  actions: {
    handleMousedown(e) {
      this.stopTextSelectionUntilMouseup();
      this.toggle(e);
    },

    keydown(e) {
      this.handleKeydown(e);
    },

    handleFocus(e) {
      let onFocus = this.get('onFocus');
      if (onFocus) { onFocus(this.get('publicAPI'), e); }
    }
  },

  // Methods
  toggle(e) {
    if (this.get('publicAPI.isOpen')) {
      this.close(e);
    } else {
      this.open(e);
    }
  },

  open(e) {
    if (this.get('disabled') || this.get('publicAPI.isOpen')) { return; }
    this.set('publicAPI.isOpen', true);
    this.addGlobalEventsTimer = run.scheduleOnce('afterRender', this, this.addGlobalEvents);
    this.repositionDropdownTimer = run.scheduleOnce('afterRender', this, this.handleRepositioningEvent);
    let onOpen = this.get('onOpen');
    if (onOpen) { onOpen(this.get('publicAPI'), e); }
  },

  close(e, skipFocus) {
    if (!this.get('publicAPI.isOpen')) { return; }
    this.set('publicAPI.isOpen', false);
    this.set('_verticalPositionClass', null);
    this.set('_horizontalPositionClass', null);
    run.cancel(this.addGlobalEventsTimer);
    run.cancel(this.repositionDropdownTimer);
    this.addGlobalEventsTimer = this.repositionDropdownTimer = null;
    this.removeGlobalEvents();
    let onClose = this.get('onClose');
    if (onClose) { onClose(this.get('publicAPI'), e); }
    if (skipFocus) { return; }
    const trigger = this.element.querySelector('.ember-basic-dropdown-trigger');
    if (trigger.tabIndex > -1) {
      trigger.focus();
    }
  },

  handleKeydown(e) {
    if (this.get('disabled')) { return; }
    let onKeydown = this.get('onKeydown');
    if (onKeydown) { onKeydown(this.get('publicAPI'), e); }
    if (e.defaultPrevented) { return; }
    if (e.keyCode === 13) {  // Enter
      this.toggle(e);
    } else if (e.keyCode === 27) {
      this.close(e);
    }
  },

  repositionDropdown() {
    if (self.FastBoot) { return; }
    run.join(this, this._performReposition);
  },

  handleRootMouseDown(e) {
    if (!this.element.contains(e.target) && !this.get('appRoot').querySelector('.ember-basic-dropdown-content').contains(e.target)) {
      this.close(e, true);
    }
  },

  handleRepositioningEvent(/* e */) {
    run.throttle(this, 'repositionDropdown', 60, true);
  },

  addGlobalEvents() {
    if (self.FastBoot) { return; }
    this.get('appRoot').addEventListener('mousedown', this.handleRootMouseDown, true);
    self.window.addEventListener('scroll', this.handleRepositioningEvent);
    self.window.addEventListener('resize', this.handleRepositioningEvent);
    self.window.addEventListener('orientationchange', this.handleRepositioningEvent);
    if (MutObserver) {
      this.mutationObserver = new MutObserver(mutations => {
        if (mutations[0].addedNodes.length || mutations[0].removedNodes.length) {
          this.repositionDropdown();
        }
      });
      run.schedule('afterRender', this, function() {
        const dropdown = this.get('appRoot').querySelector('.ember-basic-dropdown-content');
        if (!dropdown) { return; }
        this.mutationObserver.observe(dropdown, { childList: true, subtree: true });
      });
    } else {
      run.schedule('afterRender', this, function() {
        const dropdown = this.get('appRoot').querySelector('.ember-basic-dropdown-content');
        dropdown.addEventListener('DOMNodeInserted', this.repositionDropdown, false);
        dropdown.addEventListener('DOMNodeRemoved', this.repositionDropdown, false);
      });
    }
  },

  stopTextSelectionUntilMouseup() {
    if (self.FastBoot) { return; }
    let $appRoot = Ember.$(this.get('appRoot'));
    let mouseupHandler = function() {
      $appRoot[0].removeEventListener('mouseup', mouseupHandler, true);
      $appRoot.removeClass('ember-basic-dropdown-text-select-disabled');
    };
    $appRoot[0].addEventListener('mouseup', mouseupHandler, true);
    $appRoot.addClass('ember-basic-dropdown-text-select-disabled');
  },

  removeGlobalEvents() {
    if (self.FastBoot) { return; }
    this.get('appRoot').removeEventListener('mousedown', this.handleRootMouseDown, true);
    self.window.removeEventListener('scroll', this.handleRepositioningEvent);
    self.window.removeEventListener('resize', this.handleRepositioningEvent);
    self.window.removeEventListener('orientationchange', this.handleRepositioningEvent);
    if (MutObserver) {
      if (this.mutationObserver) {
        this.mutationObserver.disconnect();
        this.mutationObserver = null;
      }
    } else {
      let dropdown = this.get('appRoot').querySelector('.ember-basic-dropdown-content');
      dropdown.removeEventListener('DOMNodeInserted', this.repositionDropdown);
      dropdown.removeEventListener('DOMNodeRemoved', this.repositionDropdown);
    }
  },

  _performReposition() {
    if (this.get('renderInPlace') || !this.get('publicAPI.isOpen')) { return; }
    let dropdown = this.get('appRoot').querySelector('.ember-basic-dropdown-content');
    if (!dropdown) { return ;}
    let trigger = this.element.querySelector('.ember-basic-dropdown-trigger');

    let $elt = Ember.$(dropdown);

    let targetRect = trigger.getBoundingClientRect();
    let ownRect = dropdown.getBoundingClientRect();
    let t = currentTransform(Ember.$(dropdown));

    if (this.get('matchTriggerWidth') === 'extend-leftward') {
      Ember.$(dropdown).css({
        transform: `translateX(${targetRect.right - ownRect.right + t.tx}px) translateY(${targetRect.bottom - ownRect.top + t.ty}px)`,
        minWidth: `${$elt.outerWidth() + targetRect.right - targetRect.left - ownRect.right + ownRect.left}px`
      });
    } else {
      Ember.$(dropdown).css({
        transform: `translateX(${targetRect.left - ownRect.left + t.tx}px) translateY(${targetRect.bottom - ownRect.top + t.ty}px)`,
        width: `${$elt.outerWidth() + targetRect.right - targetRect.left - ownRect.right + ownRect.left}px`
      });
    }
    this.set('_verticalPositionClass', 'ember-basic-dropdown--below');
  }
});
