/**
 * Created by cory on 12/30/16.
 */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const uuid_1 = require("uuid");
const concat_1 = require("./concat");
const fs_1 = require("fs");
const PDFDocument = require("pdfkit");
const path_1 = require("path");
/**
 * @desc Stamp creates a new transparent pdf with the images at the provided locations, and stamps the
 *        original pdf once.
 */
class Stamp {
    /**
     *
     * @param {String} contract - pdf stamping data contract
     * @param {String} [outfile] - out put file location. Defaults to /tmp
     * @param {Boolean} [forcetmp] - force the outfile to /tmp if true
     */
    constructor(contract, outfile, forcetmp) {
        this.contract = contract;
        this.pdf = contract.file;
        this.target = null;
        this.forcetmp = (forcetmp === undefined) ? true : forcetmp;
        if (outfile && !this.forcetmp)
            this.out = outfile;
        else
            this.out = (outfile && outfile.substr(0, 4) === '/tmp') ? outfile : `/tmp/${outfile || uuid_1.v4() + '.pdf'}`;
    }
    /**
     * @desc Generates a new pdf with image at the provided coordinates and dimensions
     * @param {{x:Number, y:Number, width:Number, height:Number}} imgs -
     * @return {Promise<String>} -
     * @private
     */
    _stamp(imgs) {
        return new Promise((fulfill, reject) => {
            let out = `/tmp/${uuid_1.v4()}.pdf`, placeholderStampPdf = `/tmp/${uuid_1.v4()}.pdf`, tmpPdf = new PDFDocument();
            imgs.forEach(({ uri, locations }) => {
                locations.forEach(({ x, y, width, height }) => {
                    tmpPdf.image(uri, x, y, { width, height });
                });
            });
            /*imgs.forEach( ( { uri, height, width, x, y } ) => {
                tmpPdf.image( uri, x, y, { width, height } )
            } )*/
            tmpPdf.pipe(fs_1.createWriteStream(out));
            tmpPdf.end();
            child_process_1.exec(`pdftk ${this.target} stamp ${out} output ${placeholderStampPdf}`, (error, stdout, stderr) => {
                if (error || stderr)
                    reject(error);
                else
                    fulfill(placeholderStampPdf);
            });
        });
    }
    /**
     * @desc Burst file into individual pages.
     *       Files written to /tmp with documentId prefix
     *
     * @returns {Promise<string[]>} - list of file names, ex. page_1.pdf, page_2.pdf, etc...
     *
     * @todo: The find operation will return an error for any file without x permission in /tmp directory
     *        the current work around is to ignore stderr in this process.
     *        Trying to grep filter 'Permission denied' has not yet worked.
     */
    burst() {
        return new Promise((fulfill, reject) => {
            let documentId = path_1.basename(this.pdf, '.pdf');
            let command = `pdftk ${this.pdf} burst output /tmp/${documentId}-pg_%d.pdf && find -L /tmp -name '${documentId}-pg_*.pdf'`;
            child_process_1.exec(command, (error, stdin, stderr) => {
                fulfill(stdin.split('\n')
                    .filter(x => x.length > 0));
            });
        });
    }
    /**
     * @desc Write new pdf with image stamp.
     * @returns {Promise<String>} - output file location
     */
    write() {
        let pages;
        return new Promise((fulfill, reject) => {
            if (!this.contract.page || typeof this.contract.page !== 'number')
                reject('Page number required.');
            this.burst()
                .then(burstPages => {
                pages = burstPages;
                let pageString = `pg_${this.contract.page}.pdf`;
                this.target = pages.find(x => x.indexOf(pageString) !== -1);
                return Promise.resolve();
            })
                .then(() => {
                return this._stamp(this.contract.stamps);
            })
                .then(stampedPage => {
                return new concat_1.Concat(pages.reduce((accum, item, index) => {
                    let pageIndex = Stamp.pageIndex(item), targetIndex = Stamp.pageIndex(this.target);
                    accum[pageIndex] = pageIndex === targetIndex ? stampedPage : item;
                    return accum;
                }, []), null, null, this.out, this.forcetmp).write();
            })
                .then(final => {
                Promise.all(pages.map(p => fs_1.unlink(p, err => {
                    if (err)
                        reject(err);
                    return Promise.resolve();
                })))
                    .then(_ => {
                    fulfill(final);
                });
            })
                .catch(e => {
                reject(e);
            });
        });
    }
    /**
     * @description Parse the page name generated from burst to an integer
     * @static
     * @param {string} page - filename
     * @returns {number}
     */
    static pageIndex(page) {
        let subject = page.split('_')[1];
        return parseInt(subject) - 1;
    }
}
exports.Stamp = Stamp;
//# sourceMappingURL=stamp.js.map