export class ToolbarAppData {
  #_title;
  #_link;
  #_picture;
  constructor(link, title, picture) {
    this.#_title = title;
    this.#_link = link;
    this.#_picture = picture;
  }

  /**
   * @type {string}
   * @readonly
   */
  get title() {
    return this.#_title;
  }

  /**
   * @type {string}
   * @readonly
   */
  get link() {
    return this.#_link;
  }

  /**
   * @type {?string}
   * @readonly
   */
  get picture() {
    return this.#_picture;
  }

  get path() {
    return (
      this.link.split('://')[0] +
      '://' +
      this.link.split('://')[1].split('/')[0]
    );
  }

  /**
   *
   * @returns {boolean}
   */
  hasPicture() {
    return !!(this.#_picture || false);
  }
}
