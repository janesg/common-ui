define([
    './helpers/component-support.js',
    './helpers/create-element-legacy.js',
    './helpers/escape-html.js',
    './helpers/clear-element.js',
    './helpers/resolve-enum-titles.js',
    './helpers/parse-iso-local-date.js',
    'document-register-element',
    'intl-api'
], (componentSupport, createElement, escapeHtml, clearElement, resolveEnumTitles, parseIsoLocalDate) => {
    /**
     * Property class for ca-property web component.
     * @exports ca-property
     * @description A custom HTML element (Web Component) that can be created using
     * document.createElement('ca-property') or included in a HTML page as an element.
     * @extends HTMLElement
     */
    class Property extends HTMLElement {
        /**
         * Executes when the element is attached to the DOM
         * @returns {void} void
         */
        attachedCallback() {
            this.render();
        }

        /**
         * observedAttributes - get a list of attributes that should effect re-render.
         * @return {Array<string>} list of attributes that effect a re-render.
         */
        static get observedAttributes() {
            return ['title'];
        }

        /**
         * Executes when any attribute is changed on the element
         * @param  {string} attrName - the name of the attribute to have changed
         * @param  {string} oldVal - the old value of the attribute
         * @param  {string} newVal - the new value of the attribute
         * @returns {void} void
         */
        attributeChangedCallback(attrName, oldVal, newVal) {
            // Only need to re-render the component if the attribute value has changed
            if (attrName === 'title' && oldVal !== newVal) {
                this.render();
            }
        }

        /**
         * Gets the name of this property being displayed.
         * This property is reflected onto the <code>name</code> attribute.
         * @returns {string} the name of the property.
         */
        get name() {
            return this.getAttribute('name');
        }

        /**
         * Sets the name of this property being displayed.
         * This property is reflected onto the <code>name</code> attribute.
         * @param {string} value - the name of the property.
         */
        set name(value) {
            this.setAttribute('name', value);
        }

        /**
         * Gets the title of this property to be displayed.
         * This property is reflected onto the <code>title</code> attribute.
         * @returns {string} the title of the property
         */
        get title() {
            return this.getAttribute('title');
        }

        /**
         * Sets the the title of this property to be displayed.
         * If attached to the DOM, this will cause a re-render.
         * This property is reflected onto the <code>title</code> attribute.
         * @param {string} value - the title of the property
         */
        set title(value) {
            this.setAttribute('title', value);
        }

        /**
         * Gets the JSON schema fragment of the property being displayed.
         * @returns {object} the JSON schema fragment defining the property
         */
        get property() {
            return this._property;
        }

        /**
         * Sets the JSON schema fragment of the property to display.
         * If attached to the DOM, this will cause a re-render.
         * @param {object} value - the JSON schema fragment defining the property
         */
        set property(value) {
            this._property = value;
            if (this.parentNode) {
                this.render();
            }
        }

        /**
         * Gets the value being displayed for the property, in the correct type for the schema.
         * @returns {*} the value of the object being displayed
         */
        get value() {
            return this._value;
        }

        /**
         * Sets the value to display for the property, in the correct type for the schema.
         * If attached to the DOM, this will cause a re-render.
         * Simple string and number values are reflected onto the <code>data-value</code> attribute.
         * @param {*} value - the value to display for the property
         */
        set value(value) {
            this._value = value;
            if (typeof value === 'string' || typeof value === 'number') {
                this.setAttribute('data-value', value.toString());
            }
            if (this.parentNode) {
                this.render();
            }
        }

        /**
         * Renders the element (invoked via render.call(this))
         * @access private
         * @returns {void} void§
         */
        render() {
            clearElement(this);

            // creates the element for the given property value
            const item = this.property && this.formatDataForDisplay(this.property, this.value);

            // if more than one element, add as a list (showing all items)
            // TODO: check this doesn't damage other projects, best to keep arrays as arrays
            if (Array.isArray(item) && item.length > 0) {

                // keep a record of number of children as attribute of property
                this.setAttribute('data-count', item.length);

                // create a list container
                const ul = createElement(null, 'ul', {});

                // create an li for each item and inject its value
                item.forEach((val) => {
                    let li,
                        stringVal;
                    if (typeof val === 'object') {
                        li = createElement(ul, 'li', null);
                        Property.appendContent(li, val);
                    } else {
                        stringVal = (typeof val === 'string' || typeof val === 'number') ? val.toString() : val;
                        li = createElement(ul, 'li', val ? { title: val } : null);
                        Property.appendContent(li, stringVal);
                    }
                });

                this.appendChild(ul);
            } else {

                const el = createElement(this, 'p', {});

                // if an array with no item render (none) otherwise the first item

                const firstItem = (item && item.length ? item[0] : '(none)');
                const content = Array.isArray(item) ? firstItem : item;

                // 1 or 0 items in the array, or not an array
                Property.appendContent(el, content);
            }
        }

        /**
         * Returns a string or an HTML element representing the data for display, or an array of such items.
         * @access private
         * @param {object} property - the property definition
         * @param {*} value - the raw data value
         * @returns {string|HTMLElement|Array} - string or element, or an array of strings or elements
         */
        formatDataForDisplay(property, value) {
            const language = componentSupport.getUserLanguage();
            const currency = componentSupport.getUserCurrency();
            const format = (property.items && property.items.format) || property.format || '';
            let text = '';

            switch (property.type) {

                case 'array': {

                    if (format === 'textarea') {
                        return createElement(null, 'span', {}, null, value.map(escapeHtml).join('<br>'));
                    }

                    const itemSchema = (property.items.extends && property.items.extends[0].type) || property.items.type;

                    // If the items in this array are enums...

                    if ((Array.isArray(itemSchema) || itemSchema.enum) && value) {
                        text = resolveEnumTitles(itemSchema, value);
                    } else if (property.items && Array.isArray(value)) {

                        // convert into array of strings
                        // TODO: cast item to a string if not an object, this avoid failing checks on 0 values
                        text = value.map((item) =>
                                item.name || item.title ||
                                (item !== undefined && typeof item === 'object' ? Property.createSummaryCard(property.items, item) : item.toString()) ||
                                ''
                            )
                            // remove empty values
                            .filter((item) => (item !== undefined && item !== ''))
                            // alpha sort
                            // TODO: This sort needs to be opt in as for many arrays ordering is important. If you need sorting, implement the opt in first.
                            /* .sort(function (a, b) {
                                return a > b;
                            }) */;
                    } else {
                        text = (format === 'textarea') ? value : `${(value || []).length} records`;
                    }
                    break;
                }

                case 'boolean': {
                    text = (value && 'Yes') || 'No';
                    break;
                }

                case 'integer': {
                    text = String(parseInt(value || '0', 10));
                    break;
                }

                case 'number': {
                    text = String(parseFloat(value || '0.0'));
                    break;
                }

                default: {
                    if (value) {
                        switch (format) {

                            case 'date-time': {
                                text = new window.Intl.DateTimeFormat(language, {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: 'numeric'
                                }).format(new Date(value));
                                break;
                            }

                            case 'local-date-time': {
                                const localDate = parseIsoLocalDate(value);
                                text = new window.Intl.DateTimeFormat(language, {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: 'numeric'
                                }).format(localDate);
                                break;
                            }

                            case 'birth-date':
                            case 'date': {
                                text = new window.Intl.DateTimeFormat(language, {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                }).format(new Date(value));
                                break;
                            }

                            case 'currency': {
                                text = new window.Intl.NumberFormat(language, {
                                    style: 'currency',
                                    currency: (currency.code || 'XXX')
                                }).format(value);
                                break;
                            }

                            case 'country': {
                                const targetCountry = componentSupport.countryData && componentSupport.countryData.filter(c => c.iso === value)[0];
                                text = (targetCountry && targetCountry.name) || value;
                                break;
                            }

                            default: {
                                if (property.media && property.media.type === 'image/jpeg') {
                                    text = createElement(null, 'img', { src: value });
                                } else {
                                    text = value || '';
                                }
                            }
                        }
                    }
                }
            }

            return text;
        }

        static createSummaryCard(schema, data) {
            const card = createElement(null, 'ca-summary', { type: 'card', itemsPerCol: 100 });
            card.schema = schema;
            card.data = data;
            return card;
        }

        /**
         * Injects an element or text into source element.
         * @param {HTMLElement} srcEl - source element to receive new content
         * @param {HTMLElement|string} content - content to inject into element
         * @returns {void} void
         */
        static appendContent(srcEl, content) {
            if (content instanceof HTMLElement) {
                // only append HTML elements not anything that can be considered an object
                srcEl.appendChild(content);
            } else if (content && content.length) {
                // eslint-disable-next-line no-param-reassign
                srcEl.textContent = content;
            } else {
                // eslint-disable-next-line no-param-reassign
                srcEl.innerHTML = '&nbsp;';
            }
        }
    }

    document.registerElement('ca-property', Property);
});
