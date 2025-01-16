import { EMPTY_STRING } from "./constants.js";

export { StyleComponent };

/**
 * @class
 * @classdesc Composant qui contient plusieurs règles de css.
 */
class StyleComponent {
    /**
     * @type {Object<string, Rule>}
     * @private
     */
    #stringbuilder = {};
    constructor() { }

    /**
     * Ajoute une règle.
     * @param {Rule} rule
     * @returns {this} Chaînage
     */
    addRule(rule) {
        if (this.#stringbuilder[rule.selector]) {
            this.#stringbuilder[rule.selector].addProps(rule);
        }
        else this.#stringbuilder[rule.selector] = rule;
        return this;
    }

    /**
     * Ajoute plusieurs règles.
     * @param {...Rule} rules
     * @returns {this} Chapinage
     */
    addRules(...rules) {
        for (const rule of rules) {
            this.addRule(rule);
        }

        return this;
    }

    /**
     * Ajoute une règle à partirs de données et non d'un objet "Rule"
     * 
     * @param {string} selector
     * @param {Object} [param1={}]
     * @param {Object<string, string | number>} [param1.css_properties={}] liste de propriétés css et de leurs valeurs
     * @returns {this} Chaînage
     */
    addCss(selector, { css_properties = {} } = {}) {
        return this.addRule(StyleComponent.CreateRule(selector, { css_properties }));
    }

    /**
     * Ajoute plusieurs règles à partirs de données
     * @param {Object<string, Object<string, string | number>> | Array<Rule>} rules Dictionnaire de sélécteurs et de propriétés css ou liste de règles
     * @return {this} Chaînage
     */
    addSomeCss(rules) {
        if (Array.isArray(rules)) this.addRules(...rules);
        else {
            for (let i = 0, keys = Object.keys(rules), len = keys.length, key = null, value = null; i < len; ++i) {
                key = keys[i];
                value = rules[key];

                this.addCss(key, { css_properties: value });
            }
        }

        return this;
    } 

    /**
     * Construit la balise <style> avec les données de la classe
     * @returns {StyleComponent}
     */
    build() {
        const keys = Object.keys(this.#stringbuilder);
        let html = [];

        if (keys.length) {
            for (let i = 0, len = keys.length, key = null, rule = null; i < len; ++i) {
                key = keys[i];
                rule = this.#stringbuilder[key];

                html.push(rule.toString());
            }

            html = html.join(' ');
        }
        else html = EMPTY_STRING;

        let style = document.createElement('style');
        style.appendChild(document.createTextNode(html));

        return style;
    }

    /**
     * Libère les données de la classe
     * @returns {this} Chaînage
     */
    free() {
        this.#stringbuilder = {};
        return this;
    }

    /**
     * Créer une règle css.
     * @param {string} selector
     * @param {Object} [param1={}]
     * @param {Object<string, string | number>} [param1.css_properties=null] liste de propriétés css et de leurs valeurs
     * @returns {Rule}
     * @static
     */
    static CreateRule(selector, { css_properties = null } = {}) {
        return new Rule(selector, { css_properties });
    }

    static get RuleClass() {
        return Rule;
    }
}

/**
 * @class
 * @classdesc Représentation d'un règle css
 */
class Rule {
    #selector = null;
    #props = {};
    /**
     * Une règle css est défini par un sélécteur ainsi que des propriétés css.
     * @param {string} selector
     * @param {Object} [param1={}]
     * @param {Object<string, string | number>} [param1.css_properties=null] liste de propriétés css et de leurs valeurs
     */
    constructor(selector, { css_properties = null } = {}) {
        this.#selector = selector;
        this.#props = css_properties ?? this.#props ?? {};
    }

    /**
     * Selecteur css
     * @type {string}
     */
    get selector() {
        return this.#selector;
    }

    /**
     * Ajoute une propriétée css
     * @param {string} key Propriétée
     * @param {string | number} value Valeur de la propriétée
     * @returns {this} Chaînage
     */
    addProp(key, value) {
        this.#props[key] = value;
        return this;
    }

    /**
     * Ajoute plusieurs propriétées css
     * @param {Object<string, string | number> | Rule} config
     * @returns {this} Chaînage
     */
    addProps(config) {
        if (config.addProps) {
            for (const prop of config) {
                this.addProp(prop.property, prop.value);
            }
        }
        else {
            config ??= {};
            const keys = Object.keys(config);
    
            if (keys.length) {
                for (let i = 0, len = keys.length, key = null, value = null; i < len; ++i) {
                    key = keys[i];
                    value = this.#props[key];
    
                    this.addProp(key, value);
                }
            }
        }

        return this;
    }

    /**
     * Récupère la valeur d'une propriétée
     * @param {string} key
     * @returns {string | number}
     */
    getProp(key) {
        return this.#props[key];
    }

    /**
     * Supprime une propriétée
     * 
     * @param {string} key
     * @returns {this} Chaînage
     */
    deleteProp(key) {
        this.#props[key] = null;
        return this;
    }

    /**
     * Récupère sous forme de string
     * @returns {string}
     */
    toString() {
        const keys = Object.keys(this.#props);
        let html = EMPTY_STRING;

        if (keys.length) {
            html = [`${this.#selector} {`];

            for (let i = 0, len = keys.length, key = null, value = null; i < len; ++i) {
                key = keys[i];
                value = this.#props[key];

                if (value) html.push(`${key}:${value};`);
            }

            html.push('}');
            html = html.join(EMPTY_STRING);
        }

        return html;
    }

    *[Symbol.iterator]() {
        const keys = Object.keys(this.#props);
        for (let i = 0, len = keys.length; i < len; ++i) {
            if (this.#props[keys[i]]) yield { property: keys[i], value: this.#props[keys[i]] };
        }
    }

    /**
     * 
     * @param {string} selector
     * @param {Object} param1
     * @param {Object<string, string | number>} [param1.css_properties=null] liste de propriétés css et de leurs valeurs
     * @returns {Rule}
     */
    static Create(selector, { css_properties = null } = {}) {
        return new Rule(selector, { css_properties });
    }

    /**
     * Créer plusieurs règles à partirs de données
     * @param {Object<string, Object<string, string | number>>} rules Dictionnaire de sélécteurs et de propriétés css
     * @return {Rule[]} Chaînage
     */
    static Write(rules) {
        let created = [];

        for (let i = 0, keys = Object.keys(rules), len = keys.length, key = null, value = null; i < len; ++i) {
            key = keys[i];
            value = rules[key];

            created.push(this.Create(key, { css_properties: value }));
        }
        

        return created;
    }
}