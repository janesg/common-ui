define([
    './helpers/component-support.js',
    './helpers/clear-element.js',
    './helpers/secureajax.js',
    './helpers/trace.js',
    './helpers/create-element.js',
    './helpers/schema-to-default.js',
    './helpers/to-class-name.js',
    './helpers/dialogs.js',
    './helpers/fire-event.js',
    './helpers/clone-object.js',
    './helpers/schema-actions.js',
    './helpers/capitalize.js',
    './helpers/distinct.js',
    'document-register-element',
    './ca-form.js',
    './ca-list.js'
], (componentSupport, clearElement, ajax, trace, createElement, schemaToDefault, toClassName, dialogs, fireEvent, cloneObject, schemaActions, capitalize, distinct) => {
    /**
     * @exports ca-crud
     * A custom HTML element (Web Component) that can be created using document.createElement('ca-crud') or included in a HTML page as an element.
     */
    class Crud extends HTMLElement {
        /**
         * Executes when the element is first created
         * @returns {undefined} nothing
         */
        createdCallback() {
            this.schemaIndex = 0;
        }

        get rel() {
            return this.getAttribute('rel');
        }

        set rel(value) {
            this.setAttribute('rel', value);
        }

        /** @return {object} url to schema or instance data containing HATEOAS links */
        get src() {
            return this.getAttribute('src');
        }

        /** @param {object} value - url to schema or instance data containing HATEOAS links */
        set src(value) {
            this.setAttribute('src', value);

            // if empty url assigned, clear the screen
            if (value === '') {
                clearElement(this);
            }
            this.loadSrc();
        }

        get summaryItemsPerCol() {
            return parseInt(this.getAttribute('summary-items-per-col') || '12', 10);
        }

        set summaryItemsPerCol(value) {
            this.setAttribute('summary-items-per-col', value);
        }

        /** @return {string} the title of this component */
        get title() {
            return this.getAttribute('title') || '';
        }

        /** @param {string} title - the title of this component */
        set title(title) {
            this.setAttribute('title', title);
        }

        /** @return {Array} collection of data objects */
        get data() {
            return this._data || [];
        }

        /** @param {Array} value - collection of data objects */
        set data(value) {
            this._data = value;
        }

        /** @return {Array} collection of schema objects */
        get schema() {
            return this._schema || [];
        }

        /** @param {Array} value - collection of schema objects */
        set schema(value) {
            this._schema = value;
        }

        /** @return {Array} contains a list of data instance urls */
        get instances() {
            return this._instances;
        }

        /** @param {Array} value - contains a list of data instance urls */
        set instances(value) {
            this._instances = value;
        }

        /** @return {boolean} show a table for each schema (default true) */
        get showAll() {
            return (!this.getAttribute('show-all') || this.getAttribute('show-all') === 'true');
        }

        /** @param {boolean} value - show a table for each schema (default true) */
        set showAll(value) {
            this.setAttribute('show-all', value === true);
        }

        /**
         * Loads the .src value via Ajax - can be either a schema/data url.
         * If the request returns a JSON schema, it assigns the .schema property and checks for HATEOAS instances link of which it procecedes to load data
         * If the request returns a JSON list of data, it assigns the .data property and checks for a HATEOAS describedby link of which is proceedes to load the schema
         * @access private
         * @returns {Promise} promise resolved when s
         */
        loadSrc() {

            let schemaUrl = this.src;

            return ajax.execute({ url: schemaUrl, dataType: 'json' }).then(data => {

                if (Array.isArray(data.type)) {
                    this.schema = data.type;
                    this.instances = data.type.map(item => item.links.find(l => l.rel === 'instances'));
                    this.loadData();
                } else if (data.$schema) {
                    this.schema = [data];
                    this.instances = (data.links || []).filter(l => l.rel === 'instances');
                    this.loadData();
                } else if (data.list) {
                    this.data = [data];
                    this.instances = [{ href: schemaUrl, rel: 'instances' }];
                    schemaUrl = data.links.find(l => l.rel === 'describedby').href;
                    return ajax.execute({ url: schemaUrl, dataType: 'json' }).then(schema => {
                        this.schema = [schema];
                        this.render();
                    });
                }

                return data;
            });
        }

        /**
         * Loads the data referenced by the instances href property. Executed when this.schema property changes
         * @access private
         * @returns {undefined} nothing
         */
        loadData() {

            // convert each instance end point into a promise for loading
            const promises = distinct(this.instances, item => item.href.toLowerCase()).map(item => {
                if (item.schema && item.schema.properties && Object.keys(item.schema.properties).length) {
                    // This URL is parameterized, so we can't load it in advance.
                    return Promise.resolve([]);
                }
                return ajax.execute({ url: item.href, dataType: 'json' });
            });

            // load all promises and then merge the data
            Promise.all(promises).then(data => {
                this.data = Array.isArray(data) ? data : [data];
                this.render();
            }).catch(err => {
                trace(err);
            });
        }

        /**
         * Simply reloads the data
         * @access private
         * @returns {undefined} nothing
         */
        reload() {
            this.loadData();
        }

        /**
         * Either creates or updates the UI
         * @access private
         * @returns {undefined} nothing
         */
        render() {

            const self = this;

            clearElement(this);
            createElement(self, 'h2', {});

            const buttons = createElement(null, 'div', { class: 'buttons' });

            if (!self.showAll) {
                this.addSchemaSelector();
            }

            // create a table for each instance (unless schemaIndex is set)
            this.schema.forEach((schema, index) => {

                if (self.showAll || index === this.schemaIndex) {

                    // if we have a schema title, render it
                    if (schema.title) {
                        createElement(self, 'h3', null, schema.title);
                    }

                    const caList = createElement(null, 'ca-list', { searchable: true });
                    const css = self.rel || '';

                    const instanceSchema = (self.instances && self.instances[index]) ? self.instances[index] : null;

                    // if we need a form to parameterize the instances list, add it
                    if (instanceSchema && instanceSchema.schema && instanceSchema.schema.properties && Object.keys(instanceSchema.schema.properties).length) {

                        const caForm = createElement(self, 'ca-form', { schema: [self.instances[index].schema] });
                        const formButtons = createElement(self, 'div', { class: 'buttons' });
                        const filterButton = createElement(formButtons, 'button', {}, `List ${self.title || ''}`);
                        filterButton.onclick = this.submitParameterizedList(caForm);
                        caForm.onsave = this.loadParameterizedData(instanceSchema, caList);

                        // get defaults from schema if we have any
                        const defaultData = schemaToDefault(instanceSchema.schema);
                        caForm.populate(defaultData);

                        if (caForm.isValid()) {
                            filterButton.click();
                        }
                    }

                    // add list component for this schema
                    self.appendChild(caList);

                    // convert the title into a css selector so we can style it
                    const schemaTitleAsCss = (schema.title) ? toClassName(schema.title) : '';

                    caList.className = (schemaTitleAsCss === '') ? css : `${schemaTitleAsCss} ${css}`;
                    caList.schema = schema;
                    caList.data = (self.data[index] || {}).list;

                    caList.onrowclick = data => {

                        // do not respond to the row click if the suppress flag is true
                        if (self.onrowclicksuppress === true) {
                            // we are waiting for the hrefs to resolve and don't want to bring up a second dialog so leave now
                            return;
                        }

                        // check if there is a rel="describedby" link in the data links array
                        const describedBy = data.links && data.links.find(l => l.rel === 'describedby');
                        const canonical = data.links && data.links.find(l => l.rel === 'canonical');
                        const schemaPromise = describedBy ? componentSupport.request({
                            url: describedBy.href,
                            dataType: 'json'
                        }) : Promise.resolve(this.schema);
                        const dataPromise = canonical ? componentSupport.request({
                            url: canonical.href,
                            dataType: 'json'
                        }) : Promise.resolve(data);

                        // set suppress flag while we wait for the hrefs to resolve
                        self.onrowclicksuppress = true;
                        Promise.all([schemaPromise, dataPromise]).then(schemaAndData => {
                            // hrefs resolved so remove the suppress flag
                            delete self.onrowclicksuppress;
                            self.viewItem.call(self, schemaAndData[0], schemaAndData[1]);
                        });
                    };

                    const dataLinks = (self.data[index] && self.data[index].links) ? self.data[index].links : [];

                    const downloadUrl = (dataLinks.find(l => l.rel === 'download') || {}).href || '';

                    if (downloadUrl) {
                        // TODO: make this behaviour conditional on the ca-export element being defined.
                        createElement(buttons, 'ca-export', {
                            src: downloadUrl,
                            label: schema.title ? `Download ${schema.title}` : 'Download',
                            filename: schema.title ? `${schema.title.toLowerCase()}.xlsx` : 'download.xlsx',
                            type: 'xlsx'
                        });
                    }
                }

            });

            this.appendChild(buttons);

            // add create button if required
            if (Crud.isCreatable(this.schema)) {

                const btnCreate = createElement(buttons, 'button', null, 'Create');
                btnCreate.onclick = this.createItem.bind(self);
            }

            // update the page title
            this.querySelector('h2').textContent = this.title;

            // add default mode
            this.className = 'list-view';

            if (this.onrendercomplete) {
                this.onrendercomplete.call(this);
            }
        }

        /**
         * Creates the ca-form and switches the display.
         * @access private
         * @returns {undefined} nothing
         */
        createItem() {

            let form;
            const dlg = dialogs.open('', {
                id: 'createDialog',
                autoshow: false,
                title: `Create ${this.title}`,
                css: `animated fadeInDown ${this.rel || ''}`,
                bodycss: 'no-scroll',
                buttons: ['Cancel', 'Create'],
                callback(btnName) {
                    if (btnName === 'Create') {
                        if (form.isValid()) {
                            const createForm = document.querySelector('#createDialog form');
                            if (createForm) {
                                fireEvent(createForm, 'submit');
                            }
                        }
                        // dont allow the dialog to close
                        return false;
                    }
                    return undefined;
                }
            });

            // insert the form into the dialog
            form = createElement(dlg.body, 'ca-form');

            // dont show the dialog until all data fetched and contents rendered
            form.onrendercomplete = () => {
                dlg.show();
            };

            form.className = this.rel;
            form.oncreate = form.onupdate = () => {
                this.reload();
                dialogs.closeAll();
            };
            form.schema = this.schema;
        }

        /**
         * Allows the user to edit the ca-form
         * @access private
         * @param {url} schema - the JSON schema definition
         * @param {json} data - the JSON representation of the data
         * @returns {undefined} nothing
         */
        updateItem(schema, data) {

            const editForm = data.links.find(l => l.rel === 'edit-form');

            if (editForm != null) {
                // Use an external edit form rather than our own generated one.
                window.open(editForm.href, '_blank');
                return;
            }

            let form;
            const dlg = dialogs.open('', {
                id: 'editDialog',
                autoshow: false,
                title: `Edit ${this.title}`,
                css: `animated fadeInDown ${this.rel || ''}`,
                bodycss: 'no-scroll',
                buttons: ['Update', 'Cancel'],
                callback(btnName) {
                    if (btnName === 'Update') {
                        if (form.isValid()) {
                            const editDialogForm = document.querySelector('#editDialog form');
                            if (editDialogForm) {
                                fireEvent(editDialogForm, 'submit');
                            }
                        }
                        // dont allow the dialog to close
                        return false;
                    }
                    return undefined;
                }
            });

            // insert the form
            form = createElement(dlg.body, 'ca-form');

            // dont show the dialog until all data fetched and contents rendered
            form.onrendercomplete = () => {
                dlg.show();
            };

            form.className = this.rel;
            form.oncreate = form.onupdate = () => {
                this.reload();
                dialogs.closeAll();
            };

            // If we're working on a working-copy, then create a special working-copy schema and set the form mode to override.
            // To do this: fetch the version history, take out any records with 'self' links which match the 'working-copy' (keep these around)
            // There should only be one record left. Copy the schema and add 'defaultValue' to all entries with the data from this non-working-copy record.
            // Now go back to the working-copy data you took out of the version history earlier and set it as the data for the form. If you didn't have one,
            // create one with a self link so the form has an update URL.
            const workingCopyLink = (data.links || []).find(l => l.rel === 'working-copy');
            const versionHistoryLink = (data.links || []).find(l => l.rel === 'version-history');
            if (workingCopyLink && versionHistoryLink) {
                ajax.execute({ url: versionHistoryLink.href, dataType: 'json' }).then(versionHistory => {

                    let workingCopyData;
                    let priorVersionData;

                    const versionList = versionHistory.list;
                    for (let i = 0; i < versionList.length; i++) {
                        const version = versionList[i];
                        const versionLink = (version.links || []).find(l => l.rel === 'self');
                        if (versionLink.href === workingCopyLink.href) {
                            workingCopyData = version;
                        } else {
                            priorVersionData = version;
                        }
                    }

                    const mungedSchema = cloneObject(schema);
                    Object.keys(mungedSchema.properties).forEach(propertyName => {
                        const defaultValue = priorVersionData[propertyName];
                        if (defaultValue) {
                            mungedSchema.properties[propertyName].defaultValue = defaultValue;
                        }
                    });

                    return {
                        schema: mungedSchema,
                        data: workingCopyData || { links: [{ rel: 'self', href: workingCopyLink.href }] }
                    };
                }).then(workingCopySchemaAndData => {
                    form.mode = 'override';
                    form.schema = [workingCopySchemaAndData.schema];
                    form.data = workingCopySchemaAndData.data;
                });
            } else {
                // Assume it's got a self link, or we wouldn't have got here.
                form.schema = [schema];
                form.data = data;
            }
        }

        /**
         * Allows the user to preview the ca-form
         * @access private
         * @param {url} schema - the JSON schema definition
         * @returns {undefined} nothing
         */
        previewItem(schema) {
            const dlg = dialogs.open('', {
                id: 'previewDialog',
                autoshow: true,
                title: `Preview ${schema.title || ''}`,
                css: `animated fadeInDown ${schema.rel || ''}`,
                bodycss: 'no-scroll',
                buttons: ['Close'],
                callback() {
                }
            });

            const list = createElement(dlg.body, 'ca-crud', {
                class: 'list-view',
                rel: schema.rel || '',
                title: schema.title
            });
            list.src = schema.href;
        }

        /**
         * Allows the user to delete the ca-form
         * @access private
         * @param {json} data - the JSON representation of the data
         * @returns {undefined} nothing
         */
        deleteItem(data) {
            const deleteLink = (data.links || []).find(l => l.rel === 'delete');
            if (deleteLink) {
                dialogs.confirm('Are you sure you want to delete this item?<br><br>This action cannot be undone.', `Delete ${this.title}`, callback => {
                    if (callback === 'Delete') {
                        componentSupport.request({ url: deleteLink.href, type: deleteLink.method }).then(() => {
                            this.reload();
                            dialogs.closeAll();
                            const notifier = document.querySelector('ca-notification-container');
                            if (notifier) {
                                notifier.addNotification(createElement(null, 'ca-notification', { content: 'The item has been deleted' }));
                            }
                        }).catch(err => {
                            if (Array.isArray(err) && err[0].summary) {
                                dialogs.alert(err[0].summary, `Problem deleting ${this.title}`);
                            }
                        });
                    }
                }, 'dialog-delete-item', ['Delete', 'Cancel']);
            }
        }

        /**
         * If ca-crud.showAll is false, this method renders a html sleect allowing the user to select a schema
         * @returns {undefined} nothing
         */
        addSchemaSelector() {

            // add schema option if more than one exist
            if (this.schema.length > 1) {

                // create a form label container (acts as a row)
                const lbl = createElement(null, 'label', { for: 'schemaType', 'data-key': 'schemaType' });

                // create form field name
                createElement(lbl, 'span', null, 'Type');

                const select = createElement(lbl, 'select', { name: 'schemaType', id: 'schemaType' });

                for (let i = 0; i < this.schema.length; i++) {
                    const opt = createElement(select, 'option', { value: this.schema[i].title }, this.schema[i].title);

                    if (i === this.schemaIndex) {
                        opt.selected = true;
                    }
                }

                // switch schemas on schema type change
                select.onchange = () => {
                    this.schemaIndex = select.selectedIndex;
                    this.render();
                };

                // add to form
                this.appendChild(lbl);
            }
        }

        /**
         * Allows the user to view the ca-form.
         * @access private
         * @param {url} schema - the JSON schema definition
         * @param {json} data - the JSON representation of the data
         * @returns {undefined} nothing
         */
        viewItem(schema, data) {

            const self = this;

            // An item is editable if either a) there's a create link in the schema and a self link in the data or b) there's a working-copy link in the data
            // The latter also implies that there'll be some version-history too.
            const editable = Crud.isEditable(schema, data);
            const previewable = Crud.isPreviewable(data);
            const deletable = Crud.isDeletable(data);

            // get a list of actions from hateoas links with URN action:name
            const actions = schemaActions.getActionsFromData(data);

            // extracts action information to be used by the UI such as button labels
            const labelToAction = {};

            // extracts action information to be used by the UI such as button labels
            actions.forEach(item => {

                // store action using its name as the key, this allows retrive
                // action based on button label clicked from dialog
                labelToAction[item.title] = item;
            });

            // create an array of button labels to be added to the dialog
            const arr = ['Close'];
            if (deletable) {
                arr.splice(0, 0, 'Delete');
            }
            if (editable) {
                arr.splice(0, 0, 'Edit');
            }
            if (previewable) {
                arr.splice(0, 0, 'Preview');
            }
            const buttons = Object.keys(labelToAction).concat(arr);

            // check if this item has a download link
            const links = (data.links || []);
            const downloadUrl = (links.find(l => l.rel === 'download') || {}).href || '';
            const archivesUrl = (links.find(l => l.rel === 'archives') || {}).href || '';
            const relatedLink = links.find(l => l.rel === 'related') || '';

            const dlg = dialogs.open('', {
                id: 'viewDialog',
                autoshow: false,
                title: `View ${this.title}`,
                css: `animated fadeInDown ${self.rel || ''}`,
                bodycss: 'no-scroll',
                buttons,
                callback(button) {

                    // find the action for the button that was clicked
                    const action = labelToAction[button];

                    if (action) {

                        self.onaction(action, data, dlg);
                        return false;
                    }
                    if (previewable && button === 'Preview') {

                        self.previewItem((data.links || []).find(l => l.rel === 'preview'));
                        return false;
                    }
                    if (deletable && button === 'Delete') {

                        self.deleteItem(data);
                        return false;
                    }
                    if (editable && button === 'Edit') {

                        self.updateItem(schema, data);
                        return false;
                    }

                    return true;
                }
            });

            // add ca-export (download button)
            const btnContainer = document.querySelector('#viewDialog .dialog-buttons');

            if (downloadUrl !== '') {
                const caExport = createElement(null, 'ca-export', {
                    src: downloadUrl,
                    label: 'Download',
                    filename: 'download.xlsx',
                    type: 'xlsx'
                });

                btnContainer.insertBefore(caExport, btnContainer.firstChild);
            }

            // add related link to dom for linkng to report
            if (relatedLink !== '') {

                let href = `/?href=${relatedLink.href}&type=${this.rel}`;
                if (data.title) {
                    href += `&name=${data.title}`;
                }
                const caRelatedLink = createElement(null, 'a', {
                    class: 'dialog-button dialog-button-related',
                    href
                }, relatedLink.title);

                btnContainer.insertBefore(caRelatedLink, btnContainer.firstChild);
            }

            const summary = createElement(dlg.body, 'ca-summary', { class: self.rel || '' });

            // dont show the dialog until all data fetched and contents rendered
            summary.onrendercomplete = () => {

                // also remove extra check data-view attribute
                if (archivesUrl !== '') {
                    createElement(summary, 'ca-list', { src: archivesUrl });
                }
                dlg.show();
            };

            summary.itemsPerCol = self.summaryItemsPerCol;
            summary.schema = schema;
            summary.data = data;
        }

        /**
         * Show a dialog to indicate what action has been selected
         * @access private
         * @param {object} action - the action selected
         * @param {object} data - the data record the action was selected on for context
         * @param {object} dlg - the dialog the action was selected in
         * @returns {undefined} nothing
         */
        onaction(action, data, dlg) {
            const dlgShared = (dlg); // if a dialog was passed in its shared

            // create dialog if we dont have one
            const actionDialog = dlg || dialogs.open('', {
                id: 'actionDialog',
                autoshow: true,
                css: 'animated fadeInDown',
                bodycss: 'no-scroll'
            });

            schemaActions.action(action, actionDialog, null, data).then(result => {

                if (actionDialog && !dlgShared) {
                    actionDialog.close(); // schemaActions.action() never knew about our dialog, so we'll have to close it ourself.
                }

                // show notification if it exists
                if (result) {
                    const notifier = document.querySelector('ca-notification-container');
                    if (notifier) {
                        const text = `The following action completed successfully - ${capitalize(action.title)}`;
                        notifier.addNotification(createElement(null, 'ca-notification', { content: text }));
                    }
                }
            }).catch(err => {

                // if an error was caught
                if (err) {
                    // grab the detail and summary from the error object (with suitable defaults if not present)
                    let detail = err[0].detail || 'Unable to {0}.'.format(action.title);
                    const summary = err[0].summary || 'Action failed';
                    const items = err[0].items || [];

                    if (items && items.length > 0) {
                        const ul = createElement(null, 'ul');

                        let i = 0;
                        const l = items.length;
                        for (; i < l; i++) {
                            ul.appendChild(createElement(ul, 'li', {}, items[i]));
                        }

                        detail += ul.outerHTML;
                    }

                    dialogs.alert(detail, summary);
                }
            }).then(() => {
                this.reload();
            });
        }

        onrendercomplete() {
        }

        /**
         * Validates the ca-form and submits it.
         *
         * @param {Element} caForm - the form to submit
         * @returns {boolean} true, always
         */
        submitParameterizedList(caForm) {
            if (caForm.isValid()) {
                const paramForm = caForm.querySelector('form');
                fireEvent(paramForm, 'submit');
            }

            return true;
        }

        /**
         * Issues an AJAX call to load the data with parameters and then populate the ca-list.
         * @param {object} link - the link containing the base href
         * @param {HTMLElement} caList - the ca-list element to load the data into
         * @param {object} params - the parameters submitted
         * @returns {undefined} nothing
         */
        loadParameterizedData(link, caList, params) {

            const filterParameters = Object.keys(params)
                    .map(propertyName => `${encodeURIComponent(propertyName)}=${encodeURIComponent(params[propertyName])}`)
                    .join('&');

            const href = filterParameters ? `${link.href}?${filterParameters}` : link.href;

            ajax.execute({ url: href, dataType: 'json' }).then(data => {
                caList.data = data.list; // eslint-disable-line no-param-reassign
            });
        }

        static isCreatable(schema) {
            const schemas = Array.isArray(schema) ? schema : [schema];

            return schemas.filter(item => (item.links || []).find(l => l.rel === 'create') !== null).length > 0;
        }

        static hasWorkingCopy(data) {
            return (data.links || []).find(l => l.rel === 'working-copy') !== null;
        }

        static hasSelfLink(data) {
            return (data.links || []).find(l => l.rel === 'self') !== null;
        }

        static isEditable(schema, data) {
            return (Crud.isCreatable(schema) && Crud.hasSelfLink(data)) || Crud.hasWorkingCopy(data);
        }

        static isDeletable(data) {
            return (data.links || []).find(l => l.rel === 'delete') !== null;
        }

        static isPreviewable(data) {
            return (data.links || []).find(l => l.rel === 'preview') !== null;
        }

    }

    // Register our new element
    document.registerElement('ca-crud', Crud);
});