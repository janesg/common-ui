define('add-class', ['/components/helpers/has-class.js'], (hasClass) =>
    function (el, cls) {
        if (hasClass(el, cls)) {
            const reg = new RegExp(`\\b${cls}\\b`);
            // eslint-disable-next-line no-param-reassign
            el.className = el.className.replace(reg, '').replace('  ', ' ');
        }
    }
);