/**
 * Professional Calculator
 * Safe Mathematical Expression Parser and Engine
 * Vanilla JavaScript (No eval, No Function constructor)
 */

(function () {
  'use strict';

  /* ==========================================================================
     1. Safe Mathematical Expression Parser & Evaluator
     ========================================================================== */

  class MathParser {
    constructor(degMode = true) {
      this.degMode = degMode;
    }

    setDegMode(deg) {
      this.degMode = !!deg;
    }

    /**
     * Tokenize raw expression into structured tokens
     */
    tokenize(expr) {
      if (!expr || typeof expr !== 'string') return [];

      // Normalize unicode symbols & function aliases
      let s = expr
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/[−–—]/g, '-')
        .replace(/π/g, 'pi')
        .replace(/√/g, 'sqrt')
        .replace(/∛/g, 'cbrt')
        .replace(/²/g, '^2')
        .replace(/³/g, '^3')
        .replace(/e\^/g, 'exp')
        .replace(/sin⁻¹/g, 'asin')
        .replace(/cos⁻¹/g, 'acos')
        .replace(/tan⁻¹/g, 'atan');

      const tokens = [];
      let i = 0;
      const len = s.length;

      while (i < len) {
        const ch = s[i];

        // Whitespace
        if (/\s/.test(ch)) {
          i++;
          continue;
        }

        // Numbers (e.g. 123, 123.456, .456, 1e5, 1e-5)
        if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < len && /[0-9]/.test(s[i + 1]))) {
          let numStr = '';
          while (i < len && (/[0-9]/.test(s[i]) || s[i] === '.')) {
            numStr += s[i];
            i++;
          }
          // Scientific notation: e.g. 1.2e+5, 1e-4
          if (i < len && (s[i] === 'e' || s[i] === 'E') && i + 1 < len && /[0-9+-]/.test(s[i + 1])) {
            if (/[0-9]/.test(s[i + 1]) || ((s[i + 1] === '+' || s[i + 1] === '-') && i + 2 < len && /[0-9]/.test(s[i + 2]))) {
              numStr += s[i++];
              if (s[i] === '+' || s[i] === '-') numStr += s[i++];
              while (i < len && /[0-9]/.test(s[i])) {
                numStr += s[i++];
              }
            }
          }
          const val = parseFloat(numStr);
          if (isNaN(val)) throw new Error('Invalid number format');
          tokens.push({ type: 'NUM', value: val, raw: numStr });
          continue;
        }

        // Identifiers (functions and constants)
        if (/[a-zA-Z_]/.test(ch)) {
          let name = '';
          while (i < len && /[a-zA-Z0-9_]/.test(s[i])) {
            name += s[i];
            i++;
          }
          name = name.toLowerCase();

          if (name === 'pi') {
            tokens.push({ type: 'CONST', value: Math.PI, name: 'pi' });
          } else if (name === 'e') {
            tokens.push({ type: 'CONST', value: Math.E, name: 'e' });
          } else {
            tokens.push({ type: 'FUNC', name: name });
          }
          continue;
        }

        // Operators & delimiters
        if (ch === '+') { tokens.push({ type: 'PLUS' }); i++; continue; }
        if (ch === '-') { tokens.push({ type: 'MINUS' }); i++; continue; }
        if (ch === '*') { tokens.push({ type: 'MUL' }); i++; continue; }
        if (ch === '/') { tokens.push({ type: 'DIV' }); i++; continue; }
        if (ch === '^') { tokens.push({ type: 'POW' }); i++; continue; }
        if (ch === '!') { tokens.push({ type: 'FACT' }); i++; continue; }
        if (ch === '%') { tokens.push({ type: 'PERCENT' }); i++; continue; }
        if (ch === '(') { tokens.push({ type: 'LPAREN' }); i++; continue; }
        if (ch === ')') { tokens.push({ type: 'RPAREN' }); i++; continue; }
        if (ch === ',') { tokens.push({ type: 'COMMA' }); i++; continue; }

        throw new Error(`Unexpected character: '${ch}'`);
      }

      // Implicit multiplication insertion
      // E.g. 2pi -> 2 * pi, 2(3) -> 2 * (3), (2)(3) -> (2) * (3), 2sin(30) -> 2 * sin(30)
      const implicit = [];
      for (let j = 0; j < tokens.length; j++) {
        const curr = tokens[j];
        implicit.push(curr);
        if (j + 1 < tokens.length) {
          const next = tokens[j + 1];
          const canLeft = (curr.type === 'NUM' || curr.type === 'CONST' || curr.type === 'RPAREN' || curr.type === 'FACT' || curr.type === 'PERCENT');
          const canRight = (next.type === 'NUM' || next.type === 'CONST' || next.type === 'LPAREN' || next.type === 'FUNC');
          if (canLeft && canRight) {
            implicit.push({ type: 'MUL', implicit: true });
          }
        }
      }

      return implicit;
    }

    /**
     * Parse and evaluate tokens using Recursive Descent
     */
    evaluate(rawExpr) {
      if (!rawExpr || !rawExpr.trim()) return 0;

      // Automatically balance unclosed parentheses & strip trailing operators
      let expr = rawExpr.trim();
      expr = expr.replace(/[\+\-\*\/×÷\^]+$/, ''); // trim dangling operators

      let openCount = 0;
      for (const char of expr) {
        if (char === '(') openCount++;
        if (char === ')') openCount = Math.max(0, openCount - 1);
      }
      while (openCount > 0) {
        expr += ')';
        openCount--;
      }

      const tokens = this.tokenize(expr);
      if (tokens.length === 0) return 0;

      let pos = 0;
      const peek = () => tokens[pos];
      const consume = (expectedType) => {
        const tok = tokens[pos];
        if (!tok) throw new Error('Unexpected end of expression');
        if (expectedType && tok.type !== expectedType) {
          throw new Error(`Expected ${expectedType} but found ${tok.type}`);
        }
        pos++;
        return tok;
      };

      // Grammar:
      // parseAdditive := parseMultiplicative ( ('+'|'-') parseMultiplicative )*
      // parseMultiplicative := parsePower ( ('*'|'/') parsePower )*
      // parsePower := parseUnary ( '^' parsePower )?
      // parseUnary := ('+'|'-') parseUnary | parsePostfix
      // parsePostfix := parsePrimary ( '!' | '%' )*
      // parsePrimary := NUM | CONST | LPAREN expr RPAREN | FUNC LPAREN expr RPAREN

      const parseExpr = () => parseAdditive();

      const parseAdditive = () => {
        let leftNode = parseMultiplicative();

        while (peek() && (peek().type === 'PLUS' || peek().type === 'MINUS')) {
          const op = consume().type;
          const rightNode = parseMultiplicative();

          // Standard calculator percentage logic:
          // A + B% = A + (A * (B / 100))
          // A - B% = A - (A * (B / 100))
          if (rightNode.isPercent) {
            const pctVal = leftNode.val * rightNode.val;
            if (op === 'PLUS') {
              leftNode = { val: leftNode.val + pctVal };
            } else {
              leftNode = { val: leftNode.val - pctVal };
            }
          } else {
            if (op === 'PLUS') {
              leftNode = { val: leftNode.val + rightNode.val };
            } else {
              leftNode = { val: leftNode.val - rightNode.val };
            }
          }
        }
        return leftNode;
      };

      const parseMultiplicative = () => {
        let leftNode = parsePower();

        while (peek() && (peek().type === 'MUL' || peek().type === 'DIV')) {
          const op = consume().type;
          const rightNode = parsePower();

          if (op === 'MUL') {
            leftNode = { val: leftNode.val * rightNode.val };
          } else {
            if (Math.abs(rightNode.val) < 1e-15 || rightNode.val === 0) {
              throw new Error('Cannot divide by zero');
            }
            leftNode = { val: leftNode.val / rightNode.val };
          }
        }
        return leftNode;
      };

      const parsePower = () => {
        const leftNode = parseUnary();

        if (peek() && peek().type === 'POW') {
          consume('POW');
          const rightNode = parsePower(); // right-associative recursion
          const res = Math.pow(leftNode.val, rightNode.val);
          if (isNaN(res)) throw new Error('Invalid power calculation');
          return { val: res };
        }
        return leftNode;
      };

      const parseUnary = () => {
        if (peek() && peek().type === 'PLUS') {
          consume('PLUS');
          return parseUnary();
        }
        if (peek() && peek().type === 'MINUS') {
          consume('MINUS');
          const node = parseUnary();
          return { val: -node.val };
        }
        return parsePostfix();
      };

      const parsePostfix = () => {
        let node = parsePrimary();

        while (peek() && (peek().type === 'FACT' || peek().type === 'PERCENT')) {
          const op = consume().type;
          if (op === 'FACT') {
            node = { val: this.calcFactorial(node.val) };
          } else if (op === 'PERCENT') {
            node = { val: node.val / 100, isPercent: true };
          }
        }
        return node;
      };

      const parsePrimary = () => {
        const tok = peek();
        if (!tok) throw new Error('Unexpected end of expression');

        if (tok.type === 'NUM') {
          consume('NUM');
          return { val: tok.value };
        }

        if (tok.type === 'CONST') {
          consume('CONST');
          return { val: tok.value };
        }

        if (tok.type === 'LPAREN') {
          consume('LPAREN');
          const node = parseExpr();
          consume('RPAREN');
          return node;
        }

        if (tok.type === 'FUNC') {
          const funcName = consume('FUNC').name;
          if (!peek() || peek().type !== 'LPAREN') {
            throw new Error(`Expected '(' after function ${funcName}`);
          }
          consume('LPAREN');
          const args = [];
          if (!peek() || peek().type !== 'RPAREN') {
            args.push(parseExpr().val);
            while (peek() && peek().type === 'COMMA') {
              consume('COMMA');
              args.push(parseExpr().val);
            }
          }
          consume('RPAREN');
          return { val: this.calcFunction(funcName, args) };
        }

        throw new Error(`Unexpected token '${tok.type}'`);
      };

      const ast = parseExpr();
      if (pos < tokens.length) {
        throw new Error('Unexpected extra input');
      }

      return ast.val;
    }

    calcFactorial(n) {
      if (n < 0 || !Number.isInteger(n)) {
        throw new Error('Factorial only for non-negative integers');
      }
      if (n > 170) {
        throw new Error('Overflow: factorial too large');
      }
      let res = 1;
      for (let i = 2; i <= n; i++) {
        res *= i;
      }
      return res;
    }

    calcFunction(name, args) {
      if (args.length === 0) throw new Error(`Function ${name} requires arguments`);
      const x = args[0];

      switch (name) {
        case 'sin': {
          if (this.degMode) {
            const mod = Math.round(x) % 360;
            if (mod === 0 || Math.abs(mod) === 180) return 0;
            if (mod === 90 || mod === -270) return 1;
            if (mod === 270 || mod === -90) return -1;
            if (mod === 30 || mod === 150) return 0.5;
            if (mod === -30 || mod === -150) return -0.5;
            return Math.sin((x * Math.PI) / 180);
          }
          return Math.sin(x);
        }
        case 'cos': {
          if (this.degMode) {
            const mod = Math.round(x) % 360;
            if (mod === 90 || mod === -90 || mod === 270 || mod === -270) return 0;
            if (mod === 0) return 1;
            if (Math.abs(mod) === 180) return -1;
            if (mod === 60 || mod === 300 || mod === -60 || mod === -300) return 0.5;
            if (mod === 120 || mod === 240 || mod === -120 || mod === -240) return -0.5;
            return Math.cos((x * Math.PI) / 180);
          }
          return Math.cos(x);
        }
        case 'tan': {
          if (this.degMode) {
            const mod = Math.round(x) % 180;
            if (mod === 90 || mod === -90) throw new Error('Undefined (tan 90°)');
            if (mod === 0) return 0;
            if (mod === 45 || mod === -135) return 1;
            if (mod === -45 || mod === 135) return -1;
            return Math.tan((x * Math.PI) / 180);
          } else {
            const c = Math.cos(x);
            if (Math.abs(c) < 1e-15) throw new Error('Undefined (vertical asymptote)');
            return Math.tan(x);
          }
        }
        case 'asin': {
          if (x < -1 || x > 1) throw new Error('asin input must be [-1, 1]');
          const rad = Math.asin(x);
          return this.degMode ? (rad * 180) / Math.PI : rad;
        }
        case 'acos': {
          if (x < -1 || x > 1) throw new Error('acos input must be [-1, 1]');
          const rad = Math.acos(x);
          return this.degMode ? (rad * 180) / Math.PI : rad;
        }
        case 'atan': {
          const rad = Math.atan(x);
          return this.degMode ? (rad * 180) / Math.PI : rad;
        }
        case 'log': {
          if (x <= 0) throw new Error('log requires positive number');
          return Math.log10(x);
        }
        case 'ln': {
          if (x <= 0) throw new Error('ln requires positive number');
          return Math.log(x);
        }
        case 'sqrt': {
          if (x < 0) throw new Error('Cannot take √ of negative number');
          return Math.sqrt(x);
        }
        case 'cbrt': {
          return Math.cbrt(x);
        }
        case 'exp': {
          return Math.exp(x);
        }
        default:
          throw new Error(`Unknown function '${name}'`);
      }
    }

    /**
     * Format numerical result cleanly (handles precision, removes -0, scientific notation for extremes)
     */
    format(val) {
      if (typeof val !== 'number' || isNaN(val)) return 'Error';
      if (!isFinite(val)) return val > 0 ? 'Infinity' : '-Infinity';

      // Fix IEEE 754 precision artifacts (e.g., 0.1 + 0.2 = 0.3)
      const precision = 12;
      const rounded = parseFloat(val.toPrecision(precision));

      if (Object.is(rounded, -0)) return '0';

      const abs = Math.abs(rounded);
      if (abs !== 0 && (abs >= 1e14 || abs < 1e-9)) {
        return rounded.toExponential(8).replace(/\.?0+e/, 'e');
      }

      return String(rounded);
    }
  }

  /* ==========================================================================
     2. Calculator UI Controller & State Manager
     ========================================================================== */

  class CalculatorApp {
    constructor() {
      // DOM Elements
      this.card = document.getElementById('calculatorCard');
      this.tabSimple = document.getElementById('tabSimple');
      this.tabScientific = document.getElementById('tabScientific');
      this.scientificKeypad = document.getElementById('scientificKeypad');
      this.basicKeypad = document.getElementById('basicKeypad');
      this.displayMain = document.getElementById('displayMain');
      this.displayExpression = document.getElementById('displayExpression');
      this.degRadBtn = document.getElementById('degRadBtn');
      this.modeDegLabel = document.getElementById('modeDegLabel');
      this.modeRadLabel = document.getElementById('modeRadLabel');
      this.memoryFlag = document.getElementById('memoryFlag');
      this.copyBtn = document.getElementById('copyResultBtn');
      this.copyAlert = document.getElementById('copyAlert');
      this.historyToggleBtn = document.getElementById('historyToggleBtn');
      this.historyPanel = document.getElementById('historyPanel');
      this.historyCloseBtn = document.getElementById('historyCloseBtn');
      this.historyClearBtn = document.getElementById('historyClearBtn');
      this.historyList = document.getElementById('historyList');
      this.historyEmpty = document.getElementById('historyEmpty');
      this.historyBadge = document.getElementById('historyBadge');
      this.historyBackdrop = document.getElementById('historyBackdrop');

      // State
      this.expression = '';
      this.hasCalculated = false;
      this.isError = false;
      this.degMode = true;
      this.memory = 0;
      this.history = [];

      // Parser instance
      this.parser = new MathParser(this.degMode);

      // Initialize
      this.loadSettings();
      this.initEvents();
      this.render();
    }

    loadSettings() {
      // Load History
      try {
        const savedHistory = localStorage.getItem('calculator_history');
        if (savedHistory) {
          this.history = JSON.parse(savedHistory);
        }
      } catch (e) {
        this.history = [];
      }

      // Load Mode
      try {
        const savedMode = localStorage.getItem('calculator_mode');
        if (savedMode === 'scientific') {
          this.setMode('scientific');
        } else {
          this.setMode('simple');
        }
      } catch (e) {
        this.setMode('simple');
      }

      // Load Memory
      try {
        const savedMem = localStorage.getItem('calculator_memory');
        if (savedMem) {
          this.memory = parseFloat(savedMem) || 0;
        }
      } catch (e) {
        this.memory = 0;
      }

      this.updateMemoryFlag();
      this.renderHistory();
    }

    saveHistory() {
      try {
        localStorage.setItem('calculator_history', JSON.stringify(this.history));
      } catch (e) {}
    }

    saveMemory() {
      try {
        localStorage.setItem('calculator_memory', String(this.memory));
      } catch (e) {}
      this.updateMemoryFlag();
    }

    updateMemoryFlag() {
      if (this.memory !== 0) {
        this.memoryFlag.classList.add('visible');
      } else {
        this.memoryFlag.classList.remove('visible');
      }
    }

    setMode(mode) {
      if (mode === 'scientific') {
        this.card.classList.add('mode-scientific');
        this.scientificKeypad.style.display = 'grid';
        this.tabScientific.classList.add('active');
        this.tabScientific.setAttribute('aria-selected', 'true');
        this.tabSimple.classList.remove('active');
        this.tabSimple.setAttribute('aria-selected', 'false');
      } else {
        this.card.classList.remove('mode-scientific');
        this.scientificKeypad.style.display = 'none';
        this.tabSimple.classList.add('active');
        this.tabSimple.setAttribute('aria-selected', 'true');
        this.tabScientific.classList.remove('active');
        this.tabScientific.setAttribute('aria-selected', 'false');
      }
      try {
        localStorage.setItem('calculator_mode', mode);
      } catch (e) {}
    }

    toggleAngleMode() {
      this.degMode = !this.degMode;
      this.parser.setDegMode(this.degMode);
      if (this.degMode) {
        this.modeDegLabel.classList.add('active');
        this.modeRadLabel.classList.remove('active');
      } else {
        this.modeDegLabel.classList.remove('active');
        this.modeRadLabel.classList.add('active');
      }
    }

    /* ==========================================================================
       Action Handlers
       ========================================================================== */

    handleInput(action, value) {
      if (this.isError && action !== 'clear') {
        this.clearAll();
      }

      switch (action) {
        case 'num':
          this.appendNumber(value);
          break;
        case 'decimal':
          this.appendDecimal();
          break;
        case 'operator':
          this.appendOperator(value);
          break;
        case 'negate':
          this.toggleNegate();
          break;
        case 'percent':
          this.appendPercent();
          break;
        case 'clear':
          this.clearAll();
          break;
        case 'backspace':
          this.backspace();
          break;
        case 'equals':
          this.calculate();
          break;
        case 'const':
          this.appendConstant(value);
          break;
        case 'func':
          this.appendFunction(value);
          break;
        case 'paren-open':
          this.appendParenOpen();
          break;
        case 'paren-close':
          this.appendParenClose();
          break;
        case 'square':
          this.appendSquare();
          break;
        case 'cube':
          this.appendCube();
          break;
        case 'power':
          this.appendPower();
          break;
        case 'factorial':
          this.appendFactorial();
          break;
        case 'reciprocal':
          this.appendReciprocal();
          break;
        case 'toggle-angle':
          this.toggleAngleMode();
          break;
        case 'mem-clear':
          this.memClear();
          break;
        case 'mem-recall':
          this.memRecall();
          break;
        case 'mem-add':
          this.memAdd();
          break;
        case 'mem-sub':
          this.memSub();
          break;
      }

      this.render();
    }

    appendNumber(num) {
      if (this.hasCalculated) {
        this.expression = '';
        this.hasCalculated = false;
      }

      // Check for redundant leading zeroes
      const lastTokenMatch = this.expression.match(/([0-9.]+)$/);
      if (lastTokenMatch) {
        const lastNum = lastTokenMatch[1];
        if (lastNum === '0' && num === '0') return;
        if (lastNum === '0' && num !== '0') {
          this.expression = this.expression.slice(0, -1) + num;
          return;
        }
      }

      this.expression += num;
    }

    appendDecimal() {
      if (this.hasCalculated) {
        this.expression = '0.';
        this.hasCalculated = false;
        return;
      }

      // Find current number segment
      const lastSegment = this.expression.split(/[\+\−\-\×\*\÷\/\^\(\)]/).pop();
      if (!lastSegment || lastSegment === '') {
        this.expression += '0.';
        return;
      }

      if (lastSegment.includes('.')) {
        return; // Prevent multiple decimal points
      }

      this.expression += '.';
    }

    appendOperator(op) {
      if (this.hasCalculated) {
        this.hasCalculated = false;
        // Continue from current display result
        const currentResult = this.displayMain.textContent;
        if (currentResult && currentResult !== 'Error') {
          this.expression = currentResult;
        }
      }

      if (!this.expression) {
        if (op === '-') {
          this.expression = '-';
        }
        return;
      }

      // If expression ends with an operator, replace it
      const trailingOpMatch = this.expression.match(/(\s*[\+\−\-\×\÷\^]\s*)$/);
      if (trailingOpMatch) {
        this.expression = this.expression.slice(0, -trailingOpMatch[0].length) + ` ${op} `;
        return;
      }

      this.expression += ` ${op} `;
    }

    toggleNegate() {
      if (this.hasCalculated) {
        const val = this.displayMain.textContent;
        if (val && val !== '0' && val !== 'Error') {
          if (val.startsWith('-')) {
            this.expression = val.slice(1);
          } else {
            this.expression = '-' + val;
          }
          this.hasCalculated = false;
          return;
        }
      }

      if (!this.expression || this.expression === '0') {
        this.expression = '-';
        return;
      }

      // Check if expression is a simple wrapped negative number like (-5)
      const wrappedNegMatch = this.expression.match(/\(\-([0-9.]+)\)$/);
      if (wrappedNegMatch) {
        this.expression = this.expression.slice(0, -wrappedNegMatch[0].length) + wrappedNegMatch[1];
        return;
      }

      // Check if ending with a positive number
      const numMatch = this.expression.match(/([0-9.]+)$/);
      if (numMatch) {
        const num = numMatch[1];
        const prefix = this.expression.slice(0, -num.length);
        if (prefix.endsWith('(-')) {
          this.expression = prefix.slice(0, -2) + num;
        } else {
          this.expression = prefix + `(-${num})`;
        }
        return;
      }

      // Otherwise append (-
      this.expression += '(-';
    }

    appendPercent() {
      if (!this.expression) return;
      if (/[0-9\)]$/.test(this.expression)) {
        this.expression += '%';
      }
    }

    appendConstant(c) {
      if (this.hasCalculated) {
        this.expression = '';
        this.hasCalculated = false;
      }
      this.expression += c;
    }

    appendFunction(funcPrefix) {
      if (this.hasCalculated) {
        const currentResult = this.displayMain.textContent;
        if (currentResult && currentResult !== 'Error') {
          this.expression = `${funcPrefix}${currentResult})`;
          this.hasCalculated = false;
          return;
        }
        this.expression = '';
        this.hasCalculated = false;
      }
      this.expression += funcPrefix;
    }

    appendParenOpen() {
      if (this.hasCalculated) {
        this.expression = '';
        this.hasCalculated = false;
      }
      this.expression += '(';
    }

    appendParenClose() {
      // Check if open parentheses count > closed count
      let openCount = 0;
      for (const ch of this.expression) {
        if (ch === '(') openCount++;
        if (ch === ')') openCount--;
      }
      if (openCount > 0) {
        this.expression += ')';
      }
    }

    appendSquare() {
      if (this.hasCalculated) {
        const currentResult = this.displayMain.textContent;
        this.expression = `(${currentResult})²`;
        this.hasCalculated = false;
        return;
      }
      if (/[0-9πe\)]$/.test(this.expression)) {
        this.expression += '²';
      }
    }

    appendCube() {
      if (this.hasCalculated) {
        const currentResult = this.displayMain.textContent;
        this.expression = `(${currentResult})³`;
        this.hasCalculated = false;
        return;
      }
      if (/[0-9πe\)]$/.test(this.expression)) {
        this.expression += '³';
      }
    }

    appendPower() {
      if (this.hasCalculated) {
        const currentResult = this.displayMain.textContent;
        this.expression = currentResult + ' ^ ';
        this.hasCalculated = false;
        return;
      }
      if (/[0-9πe\)²³!%]$/.test(this.expression.trim())) {
        this.expression += ' ^ ';
      }
    }

    appendFactorial() {
      if (this.hasCalculated) {
        const currentResult = this.displayMain.textContent;
        this.expression = currentResult + '!';
        this.hasCalculated = false;
        return;
      }
      if (/[0-9\)]$/.test(this.expression)) {
        this.expression += '!';
      }
    }

    appendReciprocal() {
      if (this.hasCalculated) {
        const currentResult = this.displayMain.textContent;
        this.expression = `1/(${currentResult})`;
        this.hasCalculated = false;
        return;
      }
      // If ending with a number, wrap it in 1/(x)
      const numMatch = this.expression.match(/([0-9.]+)$/);
      if (numMatch) {
        const num = numMatch[1];
        this.expression = this.expression.slice(0, -num.length) + `1/(${num})`;
      } else {
        this.expression += '1/(';
      }
    }

    backspace() {
      if (this.hasCalculated || this.isError) {
        this.clearAll();
        return;
      }

      if (!this.expression) return;

      // Smart function token removal
      const funcTokens = [
        'sin⁻¹(', 'cos⁻¹(', 'tan⁻¹(',
        'sin(', 'cos(', 'tan(',
        'log(', 'ln(', 'exp(',
        'e^(', '√(', '∛(', '1/('
      ];

      for (const tok of funcTokens) {
        if (this.expression.endsWith(tok)) {
          this.expression = this.expression.slice(0, -tok.length);
          return;
        }
      }

      // Remove operator with spaces e.g. " + "
      const opWithSpaces = this.expression.match(/(\s*[\+\−\-\×\÷\^]\s*)$/);
      if (opWithSpaces) {
        this.expression = this.expression.slice(0, -opWithSpaces[0].length);
        return;
      }

      // Otherwise remove single character
      this.expression = this.expression.slice(0, -1);
    }

    clearAll() {
      this.expression = '';
      this.hasCalculated = false;
      this.isError = false;
      this.displayExpression.textContent = '';
      this.displayMain.textContent = '0';
      this.displayMain.classList.remove('is-error', 'font-medium', 'font-small');
    }

    calculate() {
      if (!this.expression || !this.expression.trim()) return;

      try {
        const rawExpr = this.expression;
        const val = this.parser.evaluate(rawExpr);
        const formatted = this.parser.format(val);

        if (formatted === 'Error' || formatted === 'Infinity' || formatted === '-Infinity') {
          throw new Error('Mathematical error');
        }

        // Add to history
        this.addHistory(rawExpr, formatted);

        // Update displays
        this.displayExpression.textContent = `${rawExpr} =`;
        this.displayMain.textContent = formatted;
        this.displayMain.classList.remove('is-error');
        this.hasCalculated = true;
        this.isError = false;
      } catch (err) {
        this.isError = true;
        this.displayExpression.textContent = this.expression;
        this.displayMain.textContent = err.message || 'Error';
        this.displayMain.classList.add('is-error');
      }

      this.adjustFontSize();
    }

    /* ==========================================================================
       Memory Functions (MC, MR, M+, M-)
       ========================================================================== */

    memClear() {
      this.memory = 0;
      this.saveMemory();
    }

    memRecall() {
      if (this.memory === 0) return;
      const memStr = this.parser.format(this.memory);
      if (this.hasCalculated) {
        this.expression = memStr;
        this.hasCalculated = false;
      } else {
        this.expression += memStr;
      }
      this.render();
    }

    memAdd() {
      const currentVal = this.getCurrentValue();
      if (currentVal !== null) {
        this.memory += currentVal;
        this.saveMemory();
      }
    }

    memSub() {
      const currentVal = this.getCurrentValue();
      if (currentVal !== null) {
        this.memory -= currentVal;
        this.saveMemory();
      }
    }

    getCurrentValue() {
      if (this.hasCalculated) {
        const v = parseFloat(this.displayMain.textContent);
        return isNaN(v) ? null : v;
      }
      if (this.expression) {
        try {
          return this.parser.evaluate(this.expression);
        } catch (e) {
          return null;
        }
      }
      return 0;
    }

    /* ==========================================================================
       Calculation History Management
       ========================================================================== */

    addHistory(expr, result) {
      const item = {
        expression: expr,
        result: result,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      this.history.unshift(item);
      if (this.history.length > 50) {
        this.history.pop();
      }
      this.saveHistory();
      this.renderHistory();
    }

    renderHistory() {
      this.historyList.innerHTML = '';

      if (this.history.length === 0) {
        this.historyEmpty.style.display = 'flex';
        this.historyBadge.style.display = 'none';
        return;
      }

      this.historyEmpty.style.display = 'none';
      this.historyBadge.textContent = this.history.length;
      this.historyBadge.style.display = 'block';

      this.history.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'history-item';
        li.setAttribute('tabindex', '0');
        li.setAttribute('role', 'button');
        li.setAttribute('aria-label', `${item.expression} equals ${item.result}`);

        li.innerHTML = `
          <div class="history-item-expr">${this.escapeHtml(item.expression)} =</div>
          <div class="history-item-res">${this.escapeHtml(item.result)}</div>
        `;

        // Click to restore result or continue calculation
        li.addEventListener('click', () => {
          this.expression = item.result;
          this.hasCalculated = false;
          this.displayExpression.textContent = `${item.expression} =`;
          this.render();
          this.closeHistory();
        });

        li.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            li.click();
          }
        });

        this.historyList.appendChild(li);
      });
    }

    clearHistory() {
      this.history = [];
      this.saveHistory();
      this.renderHistory();
    }

    toggleHistory() {
      const isHidden = this.historyPanel.getAttribute('aria-hidden') === 'true';
      if (isHidden) {
        this.historyPanel.setAttribute('aria-hidden', 'false');
        this.historyToggleBtn.classList.add('active');
      } else {
        this.closeHistory();
      }
    }

    closeHistory() {
      this.historyPanel.setAttribute('aria-hidden', 'true');
      this.historyToggleBtn.classList.remove('active');
    }

    /* ==========================================================================
       Copy Result
       ========================================================================== */

    copyResult() {
      const textToCopy = this.displayMain.textContent;
      if (!textToCopy || textToCopy === 'Error') return;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(() => {
          this.showCopyFeedback();
        }).catch(() => {
          this.fallbackCopy(textToCopy);
        });
      } else {
        this.fallbackCopy(textToCopy);
      }
    }

    fallbackCopy(text) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        this.showCopyFeedback();
      } catch (e) {}
      document.body.removeChild(textarea);
    }

    showCopyFeedback() {
      this.copyAlert.classList.add('show');
      setTimeout(() => {
        this.copyAlert.classList.remove('show');
      }, 1500);
    }

    /* ==========================================================================
       Rendering & Display
       ========================================================================== */

    render() {
      if (this.isError) return;

      if (this.hasCalculated) {
        // Main display already shows calculated result
        this.adjustFontSize();
        this.displayMain.scrollLeft = this.displayMain.scrollWidth;
        this.displayExpression.scrollLeft = this.displayExpression.scrollWidth;
        return;
      }

      if (!this.expression) {
        this.displayMain.textContent = '0';
        this.displayExpression.textContent = '';
      } else {
        this.displayMain.textContent = this.expression;
      }

      this.displayMain.classList.remove('is-error');
      this.adjustFontSize();
      this.displayMain.scrollLeft = this.displayMain.scrollWidth;
      this.displayExpression.scrollLeft = this.displayExpression.scrollWidth;
    }

    adjustFontSize() {
      const len = this.displayMain.textContent.length;
      this.displayMain.classList.remove('font-medium', 'font-small');

      if (len > 18) {
        this.displayMain.classList.add('font-small');
      } else if (len > 11) {
        this.displayMain.classList.add('font-medium');
      }
    }

    escapeHtml(str) {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    /* ==========================================================================
       Event Listeners & Keyboard Support
       ========================================================================== */

    initEvents() {
      // Mode tabs
      this.tabSimple.addEventListener('click', () => this.setMode('simple'));
      this.tabScientific.addEventListener('click', () => this.setMode('scientific'));

      // History controls
      this.historyToggleBtn.addEventListener('click', () => this.toggleHistory());
      this.historyCloseBtn.addEventListener('click', () => this.closeHistory());
      this.historyClearBtn.addEventListener('click', () => this.clearHistory());
      this.historyBackdrop.addEventListener('click', () => this.closeHistory());

      // Angle unit toggle button
      this.degRadBtn.addEventListener('click', () => this.toggleAngleMode());

      // Copy result button
      this.copyBtn.addEventListener('click', () => this.copyResult());

      // Delegate all button clicks from keypads & memory toolbar
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const value = btn.getAttribute('data-value') || '';
        this.handleInput(action, value);
      });

      // Keyboard input support
      window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    handleKeyDown(e) {
      // If user is focused on an input/button or panel that handles keys, ignore
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const key = e.key;

      // Digits 0-9
      if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        this.triggerButtonVisual(`button[data-action="num"][data-value="${key}"]`);
        this.handleInput('num', key);
        return;
      }

      // Decimal point
      if (key === '.') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="decimal"]');
        this.handleInput('decimal');
        return;
      }

      // Operators
      if (key === '+') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="operator"][data-value="+"]');
        this.handleInput('operator', '+');
        return;
      }
      if (key === '-') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="operator"][data-value="-"]');
        this.handleInput('operator', '-');
        return;
      }
      if (key === '*' || key.toLowerCase() === 'x') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="operator"][data-value="×"]');
        this.handleInput('operator', '×');
        return;
      }
      if (key === '/') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="operator"][data-value="÷"]');
        this.handleInput('operator', '÷');
        return;
      }
      if (key === '^') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="power"]');
        this.handleInput('power');
        return;
      }
      if (key === '%') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="percent"]');
        this.handleInput('percent');
        return;
      }
      if (key === '!') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="factorial"]');
        this.handleInput('factorial');
        return;
      }

      // Parentheses
      if (key === '(') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="paren-open"]');
        this.handleInput('paren-open');
        return;
      }
      if (key === ')') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="paren-close"]');
        this.handleInput('paren-close');
        return;
      }

      // Equals / Calculate
      if (key === 'Enter' || key === '=') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="equals"]');
        this.handleInput('equals');
        return;
      }

      // Backspace
      if (key === 'Backspace') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="backspace"]');
        this.handleInput('backspace');
        return;
      }

      // Escape / Clear
      if (key === 'Escape' || key.toLowerCase() === 'c') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="clear"]');
        this.handleInput('clear');
        return;
      }

      // Constants
      if (key.toLowerCase() === 'p') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="const"][data-value="π"]');
        this.handleInput('const', 'π');
        return;
      }
      if (key === 'e') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="const"][data-value="e"]');
        this.handleInput('const', 'e');
        return;
      }

      // Scientific shortcuts
      if (key.toLowerCase() === 's') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="func"][data-value="sin("]');
        this.handleInput('func', 'sin(');
        return;
      }
      if (key.toLowerCase() === 'o') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="func"][data-value="cos("]');
        this.handleInput('func', 'cos(');
        return;
      }
      if (key.toLowerCase() === 't') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="func"][data-value="tan("]');
        this.handleInput('func', 'tan(');
        return;
      }
      if (key.toLowerCase() === 'l') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="func"][data-value="log("]');
        this.handleInput('func', 'log(');
        return;
      }
      if (key.toLowerCase() === 'n') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="func"][data-value="ln("]');
        this.handleInput('func', 'ln(');
        return;
      }
      if (key.toLowerCase() === 'r') {
        e.preventDefault();
        this.triggerButtonVisual('button[data-action="func"][data-value="√("]');
        this.handleInput('func', '√(');
        return;
      }
    }

    triggerButtonVisual(selector) {
      try {
        const btn = document.querySelector(selector);
        if (btn) {
          btn.classList.add('keyboard-active');
          setTimeout(() => {
            btn.classList.remove('keyboard-active');
          }, 100);
        }
      } catch (e) {}
    }
  }

  // Launch application on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    new CalculatorApp();
  });
})();
