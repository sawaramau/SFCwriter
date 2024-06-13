"use strict"

const fs = require('fs');
const iconv = require('iconv-lite');

class BasicConfigures {
    constructor(layer, color, lineType, lineWidth) {
        this.layer = layer;
        this.color = color;
        this.lineType = lineType;
        this.lineWidth = lineWidth;
    }
}

class SFCWriter {
    // SXF version.3.1
    // 仕様書
    //     https://www.cals-ed.go.jp/sxf_ver3-1_specification_draft/
    #parent;
    #_layers = [];
    #features = [];
    #_colors = [];
    #_lineTypes = [];
    #_lineWidths = [];
    #_fontTypes = [];
    #_sfigs = [];
    #compositeCurves = [];
    #init = false;
    #_fd = {};
    #readOnly = false;
    #sheet;
    #attributes;
    constructor(parent) {
        if(parent) {
            this.#parent = parent;
        } else {
            this.#parent = undefined;
            this.#init = true;
            this.preDefinedColors.forEach(c => this.setColor(c));
            this.preDefinedLineType.forEach(lt => this.setLineType(lt));
            this.preDefinedLineWidths.forEach(lw => this.setLineWidth(lw));
            this.#init = false;
            this.setSheet('paper', 3, 1);
        }
    }
    get #sfigChildren() {
        return this.#sfigs.find(obj => obj.drawer === this)?.children;
    }
    readXY(xy) {
        if(xy === undefined || xy === null) {
            return [0, 0]
        }
        if(xy instanceof Array) {
            return [xy[0], xy[1]]
        }
        if(xy instanceof Object) {
            const r = [];
            for(const key in xy) {
                const k = key.toLocaleLowerCase();
                if(k === 'x' ) {
                    r[0] = xy[key];
                } else if(k === 'y') {
                    r[1] = xy[key];
                }
            }
            return r;
        }
        throw "XY object must be defined as [x, y] or {x, y}";
    }
    set path(path) {
        this.close();
        const rw = this.#readOnly ? "r" : "w";
        if(path) {
            if(path === "/dev/null") {
                this.#fd = null;
            } else {
                this.#fd = fs.openSync(path, rw);
            }
        }
    }
    close() {
        if(this.#fd) {
            fs.closeSync(this.#fd);
        }
        this.#fd = undefined;
    }
    write(...args) {
        if(this.#fd) {
            const line = args.join('\n') + "\n";
            const buf = iconv.encode(line, "Shift_JIS");
            fs.writeSync(this.#fd, buf);
        } else if (this.#fd === null) {
            // no log
        } else {
            console.log(...args);
        }
    }
    get #fd() {
        if(this.#parent) {
            return this.#parent.fd();
        }
        return this.#_fd.fd;
    }
    set #fd(val) {
        if(this.#parent) {
            throw "ファイルパスはルート要素にて設定してください。";
        }
        return this.#_fd.fd = val;
    }
    get root() {
        if(this.#parent) {
            return this.#parent.obj.root;
        }
        return this;
    }
    sxfVersion(feature) {
        if(feature === undefined) {
            return "Ver.3.1";
        }
        const features = [
            "drawing_attribute_feature",
            "drawing_sheet_feature",
            "layer_feature",
            "pre_defined_font_feature",
            "user_defined_font_feature",
            "pre_defined_colour_feature",
            "user_defined_colour_feature",
            "width_feature",
            "text_font_feature",
            "point_marker_feature",
            "line_feature",
            "polyline_feature",
            "circle_feature",
            "arc_feature",
            "ellipse_feature",
            "ellipse_arc_feature",
            "text_string_feature",
            "spline_feature",
            "clothoid_feature",
            "sfig_org_feature",
            "sfig_locate_feature",
            "symbol_externally_defined_feature",
            "linear_dim_feature",
            "curve_dim_feature",
            "angular_dim_feature",
            "radius_dim_feature",
            "diameter_dim_feature",
            "label_feature",
            "balloon_feature",
            "externally_defined_hatch_feature",
            "fill_area_style_colour_feature",
            "fill_area_style_hatching_feature",
            "fill_area_style_tiles_hatching_feature",
            "composite_curve_feature",
        ];
        const ver3 = [
            "drawing_attribute_feature",
        ];
        const ver3_1 = [
            "clothoid_feature",
            "curve_dim_feature",
        ]
        if(ver3_1.includes(feature)) {
            return 3.1;
        } else if (ver3.includes(feature)) {
            return 3;
        } else if (features.includes(feature)) {
            return 0;
        }
        throw feature + "はSXF Version.3.1までに含まれていません。 ";
    }
    writeFeature(instanceNumber, keyword, parameters) {
        const version = (() => {
            const v = this.sxfVersion(keyword);
            if(v === 0) {
                return '';
            }
            return String(v);
        })();
        const parameter2string = (parameter) => {
            if(parameter instanceof Array) {
                return "'(" + parameter.join(',') + ")'";
            }
            if(typeof parameter === 'string' || parameter instanceof String) {
                return "\\'" + parameter + "\\'"
            }
            return "'" + parameter + "'";
        }
        //let entityInstance = 
        return "/*SXF" + version + "\n" + 
        "#" + instanceNumber + " = " + keyword + 
        "(" +
        parameters.map(p => parameter2string(p)).join(',') +
        ")\n" +
        "SXF" + version + "*/";
    }
    record(keyword, parameters) {
        const feature = (instanceNumber) => {
            return this.writeFeature(instanceNumber, keyword, parameters);
        }
        this.#features.push(feature);
    }
    sfigLocate(layer, name, xy, angle, ratioXY) {
        const keyword = "sfig_locate_feature";
        const parameters = [];
        parameters.push(this.setLayer(layer));
        parameters.push(name);
        const [x, y] = this.readXY(xy);
        parameters.push(x);
        parameters.push(y);
        parameters.push(angle);
        const [rx, ry] = this.readXY(ratioXY);
        parameters.push(rx);
        parameters.push(ry);
        this.record(keyword, parameters);
        const index = this.#sfigs.findIndex(obj => obj.drawer === this);
        if(index !== -1) {
            const childIndex = this.#sfigs.findIndex(obj => obj.name === name);
            if(childIndex === -1) {
                throw "sfig'" + name + "'が作成されていません。";
            }
            this.#sfigChildren.add(this.#sfigs[childIndex]);
        }
    }
    put(layer, xy, angle,ratioXY) {
        if(!this.#parent) {
            throw "";
        }
        const name = this.#sfigs.find(obj => obj.drawer === this)?.name;
        if(name !== undefined) {
            this.#parent.obj.sfigLocate(layer, name, xy, angle, ratioXY);
            return;
        }
        throw "Cannot find this sfig object";
    }
    /**
     * 
     * @param {*} layer 
     * @param {*} color 
     * @param {*} startXY 
     * @param {Numbre} markerCode 1~7
     * @param {*} rotate 
     * @param {*} scale 
     */
    drawDot(layer, color, startXY, markerCode, rotate, scale) {
        const keyword = "point_marker_feature";
        const [x, y] = this.readXY(startXY);
        const parameters = [
            this.setLayer(layer),
            this.setColor(color),
            x, y, markerCode, rotate, scale
        ];
        this.record(keyword, parameters);
    }
    // 直線
    drawLine(basic, xArray, yArray) {
        const keyword = "line_feature";
        const parameters = [
            this.setLayer(basic.layer),
            this.setColor(basic.color),
            this.setLineType(basic.lineType),
            this.setLineWidth(basic.lineWidth),
            xArray[0], yArray[0],
            xArray[1], yArray[1]
        ];
        this.record(keyword, parameters);
    }
    // 折線
    drawPolyLine(basic, xArray, yArray) {
        const keyword = "polyline_feature";
        const parameters = [
            this.setLayer(basic.layer),
            this.setColor(basic.color),
            this.setLineType(basic.lineType),
            this.setLineWidth(basic.lineWidth),
            xArray.length,
            xArray, yArray
        ];
        this.record(keyword, parameters);
    }
    // 円
    drawCircle(basic, centerXY, radius){
        const keyword = "circle_feature";
        const [x, y] = this.readXY(centerXY);
        const parameters = [
            this.setLayer(basic.layer),
            this.setColor(basic.color),
            this.setLineType(basic.lineType),
            this.setLineWidth(basic.lineWidth),
            x, y, radius
        ];
        this.record(keyword, parameters);
    }
    // 弧
    /**
     * 
     * @param {*} basic 
     * @param {*} centerXY 
     * @param {*} radius 
     * @param {*} angle_s 
     * @param {*} angle_e 
     * @param {*} dir 0:反時計回り 1:時計回り
     */
    drawArc(basic, centerXY, radius, angle_s, angle_e, dir) {
        // dir: 0->反時計回り 1->時計回り
        const keyword = "arc_feature";
        const [x, y] = this.readXY(centerXY);
        const parameters = [
            this.setLayer(basic.layer),
            this.setColor(basic.color),
            this.setLineType(basic.lineType),
            this.setLineWidth(basic.lineWidth),
            x, y, radius, dir,
            angle_s, angle_e
        ];
        this.record(keyword, parameters);
    }
    // 楕円
    drawEllipse(basic, centerXY, radiusXY, rotation) {
        const keyword = "ellipse_feature";
        const [x, y] = this.readXY(centerXY);
        const [rx, ry] = this.readXY(radiusXY);
        const parameters = [
            this.setLayer(basic.layer),
            this.setColor(basic.color),
            this.setLineType(basic.lineType),
            this.setLineWidth(basic.lineWidth),
            x, y, rx, ry, rotation
        ];
        this.record(keyword, parameters);
    }
    drawEllipseArc(basic, centerXY, radiusXY, rotation, angle_s, angle_e, dir){
        const keyword = "ellipse_arc_feature";
        const [x, y] = this.readXY(centerXY);
        const [rx, ry] = this.readXY(radiusXY);
        const parameters = [
            this.setLayer(basic.layer),
            this.setColor(basic.color),
            this.setLineType(basic.lineType),
            this.setLineWidth(basic.lineWidth),
            x, y, rx, ry, dir, rotation, angle_s, angle_e
        ];
        this.record(keyword, parameters);
    }
    /**
     * @param {BasicConfigures} basic layer, color, lineType, lineWidth setting object
     * @param {String} font fontName
     * @param {String} string text(max: 256bytes)
     * @param {Object|Array} xy basePoint position
     * @param {Number} height text height
     * @param {Number} width text width
     * @param {Number} spc character <-> character space
     * @param {Number} angle text angle[0,360)
     * @param {Number} slant character angle[-85,+85]
     * @param {Number} basePoint basePoint 1:左下 2:中下 3:右下 4:左中 5:中中 6:右中 7:左上 8:中上 9:右上
     * @param {Number} dir 1:横書き 2:縦書き
     */
    drawTextString(basic, font, string, xy, height, width, spc = 0, angle = 0, slant = 0, basePoint = 1, dir = 1) {
        const keyword = "text_string_feature";
        const [x, y] = this.readXY(xy);
        const parameters = [
            this.setLayer(basic.layer),
            this.setColor(basic.color),
            this.setFont(font),
            string,
            x, y, height, width, 
            spc, angle, slant, basePoint, dir
        ];
        this.record(keyword, parameters);
    }
    /**
     * @param {String} name 
     * @param {Number} flag 1:部分図（数学座標系） 2:部分図（測地座標系） 3:作図グループ 4:作図部品
     * @returns SFCWriter Object
     */
    sfigObj(name, flag = 4) {
        //   部分図とは：シートやビューポートに近い概念らしい・・
        //   https://www.bigvan.co.jp/cad/faq/data/bv_family_manual_01.pdf
        // sfigはグローバルに定義されるので、親要素はルート要素
        const keyword = "sfig_org_feature";
        if(this.#sfigs.find(sfig => sfig.name === name)) {
            throw "複合図形定義" + name + "は既に定義されています。";
        }
        const sfig = new SFCWriter({
            obj: this,
            fd: () => this.#fd,
            layers: this.#layers,
            colors: this.#colors,
            lineTypes: this.#lineTypes,
            lineWidths: this.#lineWidths,
            fontTypes: this.#fontTypes,
            sfigs: this.#sfigs,
        });
        this.#sfigs.push({
            drawer: sfig,
            name: name,
            children: new Set(),
            feature: (instanceNumber) => {
                return this.writeFeature(instanceNumber, keyword, [name, flag]);
            }
        });
        return sfig;
    }
    compositeCurveObj(basic, invisibility) {
        // compositeCurveは書いた箇所に配置されるので、親要素は直上の親要素でOK
        const keyword = "composite_curve_feature";
        const compositeCurve = new SFCWriter({
            obj: this,
            fd: () => this.#fd,
            layers: this.#layers,
            colors: this.#colors,
            lineTypes: this.#lineTypes,
            lineWidths: this.#lineWidths,
            fontTypes: this.#fontTypes,
            sfigs: this.#sfigs,
        });
        this.#compositeCurves.push({
            drawer: compositeCurve,
            feature: (instanceNumber) => {
                return this.writeFeature(instanceNumber, keyword, [
                    this.setColor(basic.color),
                    this.setLineType(basic.lineType),
                    this.setLineWidth(basic.lineWidth),
                    invisibility
                ]);
            }
        });
        return compositeCurve;
    }
    get #sfigs() {
        if(this.#parent) {
            return this.#parent.sfigs;
        }
        return this.#_sfigs;
    }
    get #colors() {
        if(this.#parent) {
            return this.#parent.colors;
        }
        return this.#_colors;
    }
    get #lineTypes () {
        if(this.#parent) {
            return this.#parent.lineTypes;
        }
        return this.#_lineTypes;
    }
    get #lineWidths() {
        if(this.#parent) {
            return this.#parent.lineWidths;
        }
        return this.#_lineWidths;
    }
    get #fontTypes() {
        if(this.#parent) {
            return this.#parent.fontTypes;
        }
        return this.#_fontTypes;
    }
    get #layers() {
        if(this.#parent) {
            return this.#parent.layers;
        }
        return this.#_layers;
    }
    get lineTypes() {
        return this.#lineTypes.filter(lt => lt.use);
    }
    get lineWidths() {
        return this.#lineWidths.filter(lw => lw.use);
    }
    get colors() {
        return this.#colors.filter(c => c.use);
    }
    setColor(color) {
        const use = !this.#init;
        if (!this.#init) {
            const index = this.#colors.findIndex((obj, i) => {
                const c = obj.color;
                if(i < 16) {
                    if(color instanceof Array) {
                        return false;
                    }
                    return c.toLocaleLowerCase() === color.toLocaleLowerCase();
                }
                if(color instanceof Array) {
                    return color.reduce((acc, cur, i) => acc && (cur === c[i]) , true);
                }
                return false;
            });
            if(index !== -1) {
                const found = this.#colors[index];
                if(!found.use) {
                    found.use = true;
                }
                return index + 1;
            }
        }
        const colorDefine = {
            color: color,
            use: use
        };
        if(this.#colors.length < 16) {
            colorDefine.preDefine = true;
        }
        this.#colors.push(colorDefine);
        if(this.#colors.length > 256) {
            throw "色定義は既定義16種を含め256種類が上限です。";
        }
        return this.#colors.length;
    }
    setLineType(lineType, pitch) {
        const use = !this.#init;
        if(!this.#init) {
            const index = this.#lineTypes.findIndex(obj => {
                const lt = obj.lineType;
                return lt.toLocaleLowerCase() === lineType.toLocaleLowerCase();
            });
            if(index !== -1) {
                const found = this.#lineTypes[index];
                if(pitch && found.pitch) {
                    if(
                        found.pitch.length !== pitch.length
                        || !found.pitch.reduce((acc, cur, i) => acc && (cur, pitch[i]), true) 
    
                    ) {
                        throw "同一名称で異なるピッチを定義しようとしています。";
                    }
                } else if (pitch && !(found.pitch)) {
                    if(index < 16) {
                        throw "既定義線種'" + lineType + "'のピッチを定義することはできません。";
                    }
                    found.pitch = pitch;
                    found.segment = pitch.length;
                    if(found.segment > 8 || found.segment % 2 !== 0) {
                        throw "線種ピッチの定義が不正です。（セグメント数8以下の偶数）";
                    }
                }
                if(!found.use) {
                    found.use = true;
                }
                return index + 1;
            }
            
        }
        const lineTypeDefine = {
            lineType: lineType,
            pitch: pitch,
            segment: pitch?.length,
            use: use
        };
        if(this.#lineTypes.length < 16) {
            lineTypeDefine.preDefine = true;
        } else if (!pitch) {
            throw "ピッチが未定義です。";
        } else if((pitch.length > 8) || (pitch.length % 2) !== 0) {
            throw "線種ピッチの定義が不正です。（セグメント数8以下の偶数）";
        }
        this.#lineTypes.push(lineTypeDefine);
        if(this.#lineTypes.length > 32) {
            throw "線種定義は既定義16種を含め32種類が上限です。";
        }
        return this.#lineTypes.length;
    }
    setLineWidth(lineWidth) {
        const use = !this.#init;
        if(!this.#init) {
            const index = this.#lineWidths.findIndex((obj, i) => {
                const lw = obj.lineWidth;
                return lineWidth === lw;
            });
            if(index !== -1) {
                const found = this.#lineWidths[index];
                if(!found.use) {
                    found.use = true;
                }
                return index + 1;
            }    
        }
        const lineWidthDefine = {
            lineWidth: lineWidth,
            use: use
        };
        if(this.#lineWidths.length < 10) {
            lineWidthDefine.preDefine = true;
        }
        this.#lineWidths.push(lineWidthDefine);
        if(this.#lineWidths.length > 16) {
            throw "線幅定義は既定義10種を含め16種類が上限です。";
        }
        return this.#lineWidths.length;
    }
    setFont(fontName) {
        const index = this.#fontTypes.findIndex((fn, i) => {
            return fn === fontName;
        });
        if(index !== -1) {
            const found = this.#fontTypes[index];
            return index + 1;
        }
        this.#fontTypes.push(fontName);
        if(this.#fontTypes.length > 1024) {
            throw "使用できるフォントは1024種類までです。";
        }
        return this.#fontTypes.length;
    }
    setLayer(name, viewFlag) {
        if(name === undefined) {
            return 1;
        }
        const index = this.#layers.findIndex(layer => layer.name === name);
        if(index !== -1) {
            const found = this.#layers[index];
            if(viewFlag !== undefined) {
                found.viewFlag = viewFlag;
            }
            return index + 1;
        }
        const layer = {
            name:name
        };
        if(viewFlag === undefined) {
            layer.viewFlag = 1;
        } else {
            layer.viewFlag = viewFlag;
        }
        this.#layers.push(layer);
        if(this.#layers.length > 256) {
            throw "レイヤ数の最大数は256です。";
        }
        return this.#layers.length;
    }
    setAttributes(officeName, constructionName, contractClass, figName, figNumber, figTypeStr, scaleStr, date, recievedOrganization, OrderOrganization) {
        const keyword = "drawing_attribute_feature";
        const parameters = [
            officeName, constructionName, contractClass, figName, String(figNumber), figTypeStr, scaleStr, 
            date.getFullYear(),
            date.getMonth() + 1,
            date.getDate(),
            recievedOrganization, OrderOrganization
        ];
        const feature = (instanceNumber) => {
            return this.writeFeature(instanceNumber, keyword, parameters);
        }
        this.#attributes = feature;
    }
    /**
     * 
     * @param {*} name 
     * @param {*} sheetType 0:A0 1:A1 2:A2 3:A3 4:A4 9:Free size
     * @param {*} orient シートタイプがA0~A4のとき、0:縦 1:横
     * @param {*} wh シートタイプがフリーサイズのとき
     */
    setSheet(name, sheetType, orient, wh) {
        const [w, h] = this.readXY(wh);
        const keyword = "drawing_sheet_feature";
        const parameters = [
            name, sheetType, orient, w, h
        ];
        const feature = (instanceNumber) => {
            return this.writeFeature(instanceNumber, keyword, parameters);
        }
        this.#sheet = feature;
    }
    get preDefinedLineType() {
        return [
            "continuous",
            "dashed",
            "dashed spaced",
            "long dashed dotted",
            "long dashed double-dotted",
            "long dashed triplicate-dotted",
            "dotted",
            "chain",
            "chain double dash",
            "dashed dotted",
            "Double-dashed dotted",
            "dashed double-dotted",
            "double-dashed double-dotted",
            "dashed triplicate-dotted",
            "double-dashed triplicate-dotted",
            "未使用"
        ];
    }
    get preDefinedColors() {
        return [
            "black",
            "red",
            "green",
            "blue",
            "yellow",
            "magenta",
            "cyan",
            "white",
            "deeppink",
            "brown",
            "orange",
            "lightgreen",
            "lightblue",
            "lavender",
            "lightgray",
            "darkgray",
        ];
    }
    get preDefinedLineWidths() {
        return [
            0.13,
            0.18,
            0.25,
            0.35,
            0.5,
            0.7,
            1.0,
            1.4,
            2.0,
            "未使用",
        ];
    }

    output(path, options) {
        const date = new Date().toISOString();
        try {
            this.path = "/dev/null";
            // ダミー実行して変な内容がないか確認
            this.writeDataSection(options);   
            // sfigsの実行順序を適切に修正
            this.#sfigsReorder(); 
        } catch (e) {
            this.close();
            console.log(e);
            return;
        }
        this.path = path;
        this.write("ISO-10303-21;");
        this.write("HEADER;");
        this.write("FILE_DESCRIPTION(('SCADEC level2 feature_mode'),'2;1');");
        this.write("FILE_NAME('" + path + "','" + date + "',('author'),('organization'),'SCADEC_API_Ver3.10$$3.1','translator');");
        this.write("FILE_SCHEMA(('ASSOCIATIVE_DRAUGHTING'));");
        this.write("ENDSEC;");
        this.write("DATA;");
        this.writeDataSection(options);
        this.write("ENDSEC;");
        this.write("END-ISO-10303-21;");
        this.close();
    }

    sfigLoopCheck(ancestors = new Set()) {
        if(ancestors.has(this)) {
            throw "部分図定義に循環参照があります。(" + this.#sfigs.find(o => o.drawer === this).name + ")";
        }
        ancestors.add(this);
        this.#sfigChildren.forEach(child => {
            const set = new Set(ancestors);
            child.drawer.sfigLoopCheck(set);
        });
    }

    #preCheck() {
        if(this.#sfigChildren) {
            this.sfigLoopCheck();
        }
    }
    #sfigsReorder() {
        // 循環参照チェックは終わってるので、リオーダー可能な事は保証されている
        // sfigの登録順序が利用順となるように並び替える
        const leaves = new Set();
        const isSuperSet = (subSet) => {
            for(const elem of subSet) {
                if(!leaves.has(elem)) {
                    return false;
                }
            }
            return true;
        };
        while(this.#sfigs.length !== leaves.size) {
            const newLeaves = this.#sfigs.filter(obj => isSuperSet(obj.children));
            newLeaves.forEach(l => leaves.add(l));
        }
        while(this.#sfigs.length){
            this.#sfigs.pop();
        }
        for(const leaf of leaves.values()) {
            this.#sfigs.push(leaf);
        }
    }

    writeDataSection(options = {}, instanceNumber = 10, step = 10) {
        if(this.#fd === null) {
            this.#preCheck();
        }
        let index = 0;
        if(!this.#parent) {
            // OK:write defines feature
            index += this.writeColors(instanceNumber + index, step);
            index += this.writeLineTypes(instanceNumber + index, step);
            index += this.writeLineWidths(instanceNumber + index, step);
            index += this.writeFonts(instanceNumber + index, step);
            // OK:write sfigs writeDataSection and sfigs feature
            for(const sfig of this.#sfigs) {
                index += sfig.drawer.writeDataSection(options, instanceNumber + index, step);
                const line = sfig.feature(instanceNumber + index);
                this.write(line);
                index += step;
            };
        }
        // OK:write compositeCurves writeDataSection and compositeCurve feature
        for(const compositeCurve of this.#compositeCurves) {
            index += compositeCurve.drawer.writeDataSection(options, instanceNumber + index, step);
            const line = compositeCurve.feature(instanceNumber + index);
            this.write(line);
            index += step;
        };
        // OK:write attributes feature
        if(this.#attributes) {
            this.write(this.#attributes(instanceNumber + index));
            index += step;
        }
        // OK:write own featuers
        for(const feature of this.#features) {
            const line = feature(instanceNumber + index);
            this.write(line);
            index += step;
        }        
        if(!this.#parent) {
            // OK:write sheet feature
            this.write(this.#sheet(instanceNumber + index));
            index += step;
            // write layers feature
            index += this.writeLayers(instanceNumber + index, step);
        }
        return index;
    }
    writeColors(instanceNumber, step) {
        let index = 0;
        const preKeyword = "pre_defined_colour_feature";
        const userKeyword = "user_defined_colour_feature";
        const features = this.colors.map(obj => {
            return (instanceNumber) => {
                const keyword = obj.preDefine ? preKeyword : userKeyword;
                const parameters = obj.preDefine ? [obj.color] : obj.color;
                return this.writeFeature(instanceNumber, keyword, parameters);
            };
        });
        for(const feature of features) {
            this.write(feature(instanceNumber + index));
            index += step;
        }
        return index;
    }
    writeLineTypes(instanceNumber, step) {
        let index = 0;
        const preKeyword = "pre_defined_font_feature";
        const userKeyword = "user_defined_font_feature";
        const features = this.lineTypes.map(obj => {
            return (instanceNumber) => {
                const keyword = obj.preDefine ? preKeyword : userKeyword;
                const parameters = obj.preDefine ? [obj.lineType] : [obj.lineType, obj.segment, obj.pitch];
                return this.writeFeature(instanceNumber, keyword, parameters);
            };
        });
        for(const feature of features) {
            this.write(feature(instanceNumber + index));
            index += step;
        }
        return index;
    }
    writeLineWidths(instanceNumber, step) {
        let index = 0;
        const preKeyword = "width_feature";
        const userKeyword = "width_feature";
        const features = this.lineWidths.map(obj => {
            return (instanceNumber) => {
                const keyword = obj.preDefine ? preKeyword : userKeyword;
                const parameters = obj.preDefine ? [obj.lineWidth] : [obj.lineWidth];
                return this.writeFeature(instanceNumber, keyword, parameters);
            };
        });
        for(const feature of features) {
            this.write(feature(instanceNumber + index));
            index += step;
        }
        return index;
    }
    writeFonts(instanceNumber, step) {
        let index = 0;
        //const preKeyword = "text_font_feature";
        const userKeyword = "text_font_feature";
        const features = this.#fontTypes.map(font => {
            return (instanceNumber) => {
                const keyword = userKeyword;
                const parameters =[font];
                return this.writeFeature(instanceNumber, keyword, parameters);
            };
        });
        for(const feature of features) {
            this.write(feature(instanceNumber + index));
            index += step;
        }
        return index;
    }
    writeLayers(instanceNumber, step) {
        let index = 0;
        const keyword = "layer_feature";
        const features = this.#layers.map(layer => {
            const parameters = [layer.name, layer.viewFlag];
            return (instanceNumber) => {
                return this.writeFeature(instanceNumber, keyword, parameters);
            }
        });
        for(const feature of features) {
            this.write(feature(instanceNumber + index));
            index += step;
        }
        return index;
    }
}

const sfc = new SFCWriter();
const group = sfc.sfigObj("part1");
const basic = new BasicConfigures("layer1", "red", "continuous", 0.13);
const basic2 = new BasicConfigures("layer1", "blue", "continuous", 0.13);
sfc.setAttributes('a', 'b', 'c', 'd', 1, 'e', 'f', new Date(), 'g', 'h');
sfc.drawArc(basic, [100,100], 100, 0, 180, 1);
sfc.drawCircle(basic, [100, 100], 10);
group.drawCircle(basic, [100, 100], 50);
//sfc.sfigLocate("layer1", "part", [0, 0], 0, [1.5, 2]);
group.put("layer1", [0, 0], 0, [1.5, 2]);
const part2 = group.sfigObj("part2");
part2.put("layer2", [0,0], 0, [1,1]);
part2.drawCircle(basic2, [50, 50], 10);
const part3 = part2.sfigObj("part3");
part3.drawCircle(basic2, [10, 10], 30);
part3.put("layer3", [0,0], 0, [1, 1]);
group.sfigLocate("layer1", "part3", [0, 0], 0, [1, 1])
sfc.drawTextString(basic, 'Meiryo UI', '漢字', [100, 100], 5, 100, 1.4);
sfc.drawPolyLine(basic, [0, 100, 200], [0, 100, 500]);
sfc.output("test2.sfc");
//sfc.output("/dev/null");

