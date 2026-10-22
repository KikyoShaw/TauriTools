//! Standalone programmer calculator. Only serde derives are required.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

const MAX_INPUT_LENGTH: usize = 16 * 1024;
const MAX_TOKENS: usize = 16 * 1024;
const MAX_DEPTH: usize = 128;
const UNAVAILABLE: &str = "—";
const OVERFLOW: &str = "64 位整数溢出";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalculateRequest {
    pub expression: String,
    #[serde(default)]
    pub variables: BTreeMap<String, String>,
    #[serde(default)]
    pub angle_mode: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalculationResult {
    pub decimal: String,
    pub hex: String,
    pub octal: String,
    pub binary: String,
    pub float32: String,
    pub float64: String,
    pub ascii: String,
    pub ebcdic: String,
    pub unicode: String,
    pub kind: String,
    pub assigned_variable: Option<String>,
    pub variables: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertRequest {
    pub value: String,
    pub radix: u32,
    /// Quantize to IEEE 754 binary32 before producing the other representations.
    #[serde(default)]
    pub float32: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Number {
    Integer(i64),
    Float(f64),
}

impl Number {
    fn float(value: f64) -> Result<Self, String> {
        if value.is_finite() {
            Ok(Self::Float(value))
        } else {
            Err("计算结果不是有限数值（可能溢出或超出函数定义域）".into())
        }
    }

    fn as_float(self) -> f64 {
        match self {
            Self::Integer(value) => value as f64,
            Self::Float(value) => value,
        }
    }

    fn exact_integer(self) -> Result<i64, String> {
        match self {
            Self::Integer(value) => Ok(value),
            // The upper bound is exclusive: i64::MAX rounds to 2^63 as f64.
            Self::Float(value)
                if value.is_finite()
                    && value.fract() == 0.0
                    && (-9_223_372_036_854_775_808.0..9_223_372_036_854_775_808.0)
                        .contains(&value) =>
            {
                Ok(value as i64)
            }
            Self::Float(_) => Err("此操作需要 64 位范围内的精确整数".into()),
        }
    }

    fn canonical(self) -> String {
        match self {
            Self::Integer(value) => value.to_string(),
            Self::Float(value) => float_string(value),
        }
    }

    fn negate(self) -> Result<Self, String> {
        match self {
            Self::Integer(value) => value
                .checked_neg()
                .map(Self::Integer)
                .ok_or_else(|| OVERFLOW.into()),
            Self::Float(value) => Self::float(-value),
        }
    }
}

fn float_string(value: f64) -> String {
    let mut text = value.to_string();
    if !text.contains('.') && !text.contains('e') && !text.contains('E') {
        text.push_str(".0");
    }
    text
}

/// Evaluate statements against a private variable map. An error never publishes
/// partial assignments; a successful statement also updates `ans`.
pub fn calculate(request: CalculateRequest) -> Result<CalculationResult, String> {
    let radians = match request.angle_mode.trim().to_ascii_lowercase().as_str() {
        "" | "deg" => false,
        "rad" => true,
        _ => return Err("角度模式必须为 deg 或 rad".into()),
    };
    let tokens = tokenize(&request.expression)?;
    let mut variables = BTreeMap::new();
    for (name, text) in request.variables {
        if !valid_name(&name) {
            return Err(format!("无效的变量名：{name}"));
        }
        let number =
            parse_stored_number(&text).map_err(|error| format!("变量 {name} 的值无效：{error}"))?;
        variables.insert(name, number);
    }
    let mut parser = Parser {
        tokens,
        position: 0,
        variables,
        radians,
    };
    let mut last_value = None;
    let mut last_assignment = None;
    loop {
        while matches!(parser.current(), TokenKind::Separator) {
            parser.advance();
        }
        if matches!(parser.current(), TokenKind::End) {
            break;
        }
        let assignment = match (parser.current(), parser.next()) {
            (TokenKind::Name(name), TokenKind::Equal) => Some(name.clone()),
            _ => None,
        };
        if let Some(name) = &assignment {
            if is_constant(name) {
                return Err(format!("常量 {name} 不能赋值"));
            }
            parser.advance();
            parser.advance();
        }
        let value = parser.expression(0, 0)?;
        if !matches!(parser.current(), TokenKind::Separator | TokenKind::End) {
            return Err(parser.error("表达式后有多余内容；多条表达式请换行或使用分号"));
        }
        // Commit only after the complete statement has been validated.
        if let Some(name) = assignment {
            parser.variables.insert(name.clone(), value);
            last_assignment = Some(name);
        }
        parser.variables.insert("ans".into(), value);
        last_value = Some(value);
    }
    let value = last_value.ok_or_else(|| "请输入表达式".to_string())?;
    let variables = parser
        .variables
        .into_iter()
        .map(|(name, value)| (name, value.canonical()))
        .collect();
    Ok(format_result(value, last_assignment, variables))
}

/// Convert a decimal number or a signed/unsigned bit pattern in base 2, 8 or 16.
pub fn convert_base(request: ConvertRequest) -> Result<CalculationResult, String> {
    if request.value.len() > MAX_INPUT_LENGTH {
        return Err("输入过长，最多允许 16384 字节".into());
    }
    let text = request.value.trim();
    if text.is_empty() {
        return Err("请输入数值".into());
    }
    let mut value = match request.radix {
        10 => parse_stored_number(text)?,
        2 | 8 | 16 => parse_radix_input(text, request.radix)?,
        _ => return Err("仅支持二、八、十和十六进制".into()),
    };
    if request.float32 {
        let rounded = value.as_float() as f32;
        if !rounded.is_finite() {
            return Err("数值超出 Float32 的有限范围".into());
        }
        value = Number::Float(f64::from(rounded));
    }
    Ok(format_result(value, None, BTreeMap::new()))
}

fn valid_name(name: &str) -> bool {
    let mut chars = name.chars();
    matches!(chars.next(), Some(ch) if ch.is_ascii_alphabetic() || ch == '_')
        && chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

fn is_constant(name: &str) -> bool {
    name.eq_ignore_ascii_case("pi") || name.eq_ignore_ascii_case("e")
}

fn parse_stored_number(text: &str) -> Result<Number, String> {
    let text = text.trim();
    if text.len() > MAX_INPUT_LENGTH {
        return Err("数值过长".into());
    }
    let (negative, unsigned) = match text.as_bytes().first() {
        Some(b'-') => (true, &text[1..]),
        Some(b'+') => (false, &text[1..]),
        _ => (false, text),
    };
    if negative && is_decimal_min_magnitude(unsigned) {
        return Ok(Number::Integer(i64::MIN));
    }
    let value = parse_literal(unsigned)?;
    if negative { value.negate() } else { Ok(value) }
}

fn is_decimal_min_magnitude(text: &str) -> bool {
    !text.is_empty()
        && text.bytes().all(|byte| byte.is_ascii_digit())
        && text.parse::<u64>().ok() == Some(1_u64 << 63)
}

fn parse_literal(text: &str) -> Result<Number, String> {
    if text.is_empty() {
        return Err("缺少数值".into());
    }
    let radix = if text.starts_with("0x") || text.starts_with("0X") {
        Some((16, &text[2..]))
    } else if text.starts_with("0o") || text.starts_with("0O") {
        Some((8, &text[2..]))
    } else if text.starts_with("0b") || text.starts_with("0B") {
        Some((2, &text[2..]))
    } else if text.ends_with('h') || text.ends_with('H') {
        Some((16, &text[..text.len() - 1]))
    } else {
        None
    };
    if let Some((radix, digits)) = radix {
        return parse_bit_pattern(digits, radix, false);
    }
    if text.bytes().all(|byte| byte.is_ascii_digit()) {
        return text
            .parse::<i64>()
            .map(Number::Integer)
            .map_err(|_| OVERFLOW.into());
    }
    // f64::from_str also accepts NaN/inf and signed strings. Accept only the
    // numeric grammar here; signs belong to the parser or parse_stored_number.
    if !text
        .bytes()
        .all(|byte| byte.is_ascii_digit() || matches!(byte, b'.' | b'e' | b'E' | b'+' | b'-'))
        || !text.bytes().any(|byte| byte.is_ascii_digit())
        || text.starts_with(['+', '-'])
    {
        return Err(format!("无效的数值：{text}"));
    }
    let value = text
        .parse::<f64>()
        .map_err(|_| format!("无效的数值：{text}"))?;
    Number::float(value)
}

fn parse_bit_pattern(digits: &str, radix: u32, negative: bool) -> Result<Number, String> {
    if digits.is_empty() || !digits.chars().all(|ch| ch.is_digit(radix)) {
        return Err(format!("无效的 {radix} 进制整数"));
    }
    let bits =
        u64::from_str_radix(digits, radix).map_err(|_| "数值超出 64 位整数范围".to_string())?;
    let value = if negative {
        if bits > (1_u64 << 63) {
            return Err(OVERFLOW.into());
        }
        if bits == (1_u64 << 63) {
            i64::MIN
        } else {
            -(bits as i64)
        }
    } else {
        bits as i64
    };
    Ok(Number::Integer(value))
}

fn parse_radix_input(text: &str, radix: u32) -> Result<Number, String> {
    let (negative, mut digits) = match text.as_bytes().first() {
        Some(b'-') => (true, &text[1..]),
        Some(b'+') => (false, &text[1..]),
        _ => (false, text),
    };
    let prefix = match radix {
        2 => ["0b", "0B"],
        8 => ["0o", "0O"],
        16 => ["0x", "0X"],
        _ => return Err("不支持的进制".into()),
    };
    if digits.starts_with(prefix[0]) || digits.starts_with(prefix[1]) {
        digits = &digits[2..];
    }
    if radix == 16 && (digits.ends_with('h') || digits.ends_with('H')) {
        digits = &digits[..digits.len() - 1];
    }
    parse_bit_pattern(digits, radix, negative)
}

#[derive(Clone, Debug, PartialEq)]
enum TokenKind {
    Number(String),
    Name(String),
    Plus,
    Minus,
    Star,
    Slash,
    Percent,
    ShiftLeft,
    ShiftRight,
    And,
    Or,
    Xor,
    Not,
    Open,
    Close,
    Comma,
    Equal,
    Separator,
    End,
}

#[derive(Debug)]
struct Token {
    kind: TokenKind,
    offset: usize,
}

fn tokenize(text: &str) -> Result<Vec<Token>, String> {
    if text.len() > MAX_INPUT_LENGTH {
        return Err("表达式过长，最多允许 16384 字节".into());
    }
    let bytes = text.as_bytes();
    let mut tokens = Vec::new();
    let mut position = 0;
    let mut parentheses = 0_usize;
    while position < bytes.len() {
        let start = position;
        let byte = bytes[position];
        let kind = match byte {
            b' ' | b'\t' | b'\x0b' | b'\x0c' => {
                position += 1;
                continue;
            }
            b'\n' | b'\r' => {
                position += 1;
                if byte == b'\r' && bytes.get(position) == Some(&b'\n') {
                    position += 1;
                }
                if parentheses != 0 {
                    continue;
                }
                TokenKind::Separator
            }
            b'0'..=b'9' | b'.' => {
                let prefixed = byte == b'0'
                    && matches!(
                        bytes.get(position + 1),
                        Some(b'x' | b'X' | b'o' | b'O' | b'b' | b'B')
                    );
                position += 1;
                while let Some(&next) = bytes.get(position) {
                    let exponent_sign = !prefixed
                        && matches!(next, b'+' | b'-')
                        && matches!(bytes.get(position - 1), Some(b'e' | b'E'));
                    if next.is_ascii_alphanumeric() || matches!(next, b'.' | b'_') || exponent_sign
                    {
                        position += 1;
                    } else {
                        break;
                    }
                }
                TokenKind::Number(text[start..position].to_string())
            }
            b'a'..=b'z' | b'A'..=b'Z' | b'_' => {
                position += 1;
                while matches!(bytes.get(position), Some(next) if next.is_ascii_alphanumeric() || *next == b'_')
                {
                    position += 1;
                }
                let name = &text[start..position];
                let suffix_hex = (name.ends_with('h') || name.ends_with('H'))
                    && name.len() > 1
                    && name[..name.len() - 1]
                        .bytes()
                        .all(|digit| digit.is_ascii_hexdigit());
                if suffix_hex {
                    TokenKind::Number(name.to_string())
                } else {
                    TokenKind::Name(name.to_string())
                }
            }
            _ => {
                position += 1;
                match byte {
                    b'+' => TokenKind::Plus,
                    b'-' => TokenKind::Minus,
                    b'*' => TokenKind::Star,
                    b'/' => TokenKind::Slash,
                    b'%' => TokenKind::Percent,
                    b'&' => TokenKind::And,
                    b'|' => TokenKind::Or,
                    b'^' => TokenKind::Xor,
                    b'~' => TokenKind::Not,
                    b'(' => {
                        parentheses += 1;
                        TokenKind::Open
                    }
                    b')' => {
                        parentheses = parentheses.saturating_sub(1);
                        TokenKind::Close
                    }
                    b',' => TokenKind::Comma,
                    b'=' => TokenKind::Equal,
                    b';' => TokenKind::Separator,
                    b'<' if bytes.get(position) == Some(&b'<') => {
                        position += 1;
                        TokenKind::ShiftLeft
                    }
                    b'>' if bytes.get(position) == Some(&b'>') => {
                        position += 1;
                        TokenKind::ShiftRight
                    }
                    _ => {
                        let character = text[start..].chars().next().unwrap_or('?');
                        return Err(format!("第 {} 字节处有无效字符：{character}", start + 1));
                    }
                }
            }
        };
        tokens.push(Token {
            kind,
            offset: start,
        });
        if tokens.len() > MAX_TOKENS {
            return Err("表达式包含过多标记".into());
        }
    }
    tokens.push(Token {
        kind: TokenKind::End,
        offset: text.len(),
    });
    Ok(tokens)
}

struct Parser {
    tokens: Vec<Token>,
    position: usize,
    variables: BTreeMap<String, Number>,
    radians: bool,
}

impl Parser {
    fn current(&self) -> &TokenKind {
        self.tokens
            .get(self.position)
            .map(|token| &token.kind)
            .unwrap_or(&TokenKind::End)
    }

    fn next(&self) -> &TokenKind {
        self.tokens
            .get(self.position + 1)
            .map(|token| &token.kind)
            .unwrap_or(&TokenKind::End)
    }

    fn advance(&mut self) {
        if self.position < self.tokens.len() {
            self.position += 1;
        }
    }

    fn error(&self, message: &str) -> String {
        let offset = self
            .tokens
            .get(self.position)
            .map(|token| token.offset)
            .unwrap_or(0);
        format!("{message}（第 {} 字节）", offset + 1)
    }

    fn expression(&mut self, minimum_binding: u8, depth: usize) -> Result<Number, String> {
        if depth >= MAX_DEPTH {
            return Err("表达式嵌套过深，最多允许 128 层".into());
        }
        let mut left = self.prefix(depth + 1)?;
        loop {
            let binding = match self.current() {
                TokenKind::Or => 1,
                TokenKind::Xor => 3,
                TokenKind::And => 5,
                TokenKind::ShiftLeft | TokenKind::ShiftRight => 7,
                TokenKind::Plus | TokenKind::Minus => 9,
                TokenKind::Star | TokenKind::Slash | TokenKind::Percent => 11,
                _ => break,
            };
            if binding < minimum_binding {
                break;
            }
            let operator = self.current().clone();
            self.advance();
            let right = self.expression(binding + 1, depth + 1)?;
            left = binary(&operator, left, right)?;
        }
        Ok(left)
    }

    fn prefix(&mut self, depth: usize) -> Result<Number, String> {
        let token = self.current().clone();
        self.advance();
        match token {
            TokenKind::Number(text) => parse_literal(&text),
            TokenKind::Plus => self.expression(13, depth),
            TokenKind::Minus => {
                // The only decimal magnitude outside i64 that is valid after
                // unary minus is abs(i64::MIN).
                if let TokenKind::Number(text) = self.current()
                    && is_decimal_min_magnitude(text)
                {
                    self.advance();
                    return Ok(Number::Integer(i64::MIN));
                }
                self.expression(13, depth)?.negate()
            }
            TokenKind::Not => Ok(Number::Integer(
                !self.expression(13, depth)?.exact_integer()?,
            )),
            TokenKind::Open => {
                let value = self.expression(0, depth)?;
                if !matches!(self.current(), TokenKind::Close) {
                    return Err(self.error("缺少右括号"));
                }
                self.advance();
                Ok(value)
            }
            TokenKind::Name(name) => {
                if matches!(self.current(), TokenKind::Open) {
                    self.function(&name, depth)
                } else if name.eq_ignore_ascii_case("pi") {
                    Ok(Number::Float(std::f64::consts::PI))
                } else if name.eq_ignore_ascii_case("e") {
                    Ok(Number::Float(std::f64::consts::E))
                } else {
                    self.variables
                        .get(&name)
                        .copied()
                        .ok_or_else(|| format!("未定义的变量：{name}"))
                }
            }
            _ => Err(self.error("此处需要数值、变量或左括号")),
        }
    }

    fn function(&mut self, name: &str, depth: usize) -> Result<Number, String> {
        self.advance(); // Opening parenthesis.
        let mut arguments = Vec::new();
        if !matches!(self.current(), TokenKind::Close) {
            loop {
                arguments.push(self.expression(0, depth)?);
                if !matches!(self.current(), TokenKind::Comma) {
                    break;
                }
                self.advance();
            }
        }
        if !matches!(self.current(), TokenKind::Close) {
            return Err(self.error("函数调用缺少右括号或参数分隔逗号"));
        }
        self.advance();
        call_function(name, &arguments, self.radians)
    }
}

fn checked_integer(value: Option<i64>) -> Result<Number, String> {
    value.map(Number::Integer).ok_or_else(|| OVERFLOW.into())
}

fn binary(operator: &TokenKind, left: Number, right: Number) -> Result<Number, String> {
    match operator {
        TokenKind::And
        | TokenKind::Or
        | TokenKind::Xor
        | TokenKind::ShiftLeft
        | TokenKind::ShiftRight => {
            let left = left.exact_integer()?;
            let right = right.exact_integer()?;
            let value = match operator {
                TokenKind::And => left & right,
                TokenKind::Or => left | right,
                TokenKind::Xor => left ^ right,
                TokenKind::ShiftLeft | TokenKind::ShiftRight => {
                    if !(0..=63).contains(&right) {
                        return Err("移位位数必须是 0 到 63 之间的整数".into());
                    }
                    if matches!(operator, TokenKind::ShiftLeft) {
                        left.wrapping_shl(right as u32)
                    } else {
                        left >> (right as u32)
                    }
                }
                _ => return Err("无效的位运算符".into()),
            };
            return Ok(Number::Integer(value));
        }
        _ => {}
    }
    if let (Number::Integer(left), Number::Integer(right)) = (left, right) {
        return match operator {
            TokenKind::Plus => checked_integer(left.checked_add(right)),
            TokenKind::Minus => checked_integer(left.checked_sub(right)),
            TokenKind::Star => checked_integer(left.checked_mul(right)),
            TokenKind::Slash => {
                if right == 0 {
                    return Err("除数不能为零".into());
                }
                let quotient = left
                    .checked_div(right)
                    .ok_or_else(|| OVERFLOW.to_string())?;
                if left.checked_rem(right) == Some(0) {
                    Ok(Number::Integer(quotient))
                } else {
                    Number::float(left as f64 / right as f64)
                }
            }
            TokenKind::Percent => {
                if right == 0 {
                    return Err("取余的除数不能为零".into());
                }
                checked_integer(left.checked_rem(right))
            }
            _ => Err("无效的运算符".into()),
        };
    }
    let left = left.as_float();
    let right = right.as_float();
    if matches!(operator, TokenKind::Slash | TokenKind::Percent) && right == 0.0 {
        return Err("除数不能为零".into());
    }
    Number::float(match operator {
        TokenKind::Plus => left + right,
        TokenKind::Minus => left - right,
        TokenKind::Star => left * right,
        TokenKind::Slash => left / right,
        TokenKind::Percent => left % right,
        _ => return Err("无效的运算符".into()),
    })
}

fn integer_power(mut base: i64, exponent: i64) -> Result<Number, String> {
    let mut exponent = exponent as u64; // Caller requires a nonnegative exponent.
    let mut result = 1_i64;
    while exponent != 0 {
        if exponent & 1 != 0 {
            result = result
                .checked_mul(base)
                .ok_or_else(|| OVERFLOW.to_string())?;
        }
        exponent >>= 1;
        if exponent != 0 {
            base = base.checked_mul(base).ok_or_else(|| OVERFLOW.to_string())?;
        }
    }
    Ok(Number::Integer(result))
}

fn call_function(name: &str, arguments: &[Number], radians: bool) -> Result<Number, String> {
    let name_lower = name.to_ascii_lowercase();
    let expected = match name_lower.as_str() {
        "pow" => Some(2),
        "min" | "max" => None,
        "sin" | "cos" | "tan" | "exp" | "ln" | "log" | "abs" | "sqrt" | "floor" | "ceil"
        | "round" => Some(1),
        _ => return Err(format!("未知函数：{name}")),
    };
    if let Some(expected) = expected {
        if arguments.len() != expected {
            return Err(format!("函数 {name} 需要 {expected} 个参数"));
        }
    } else if arguments.is_empty() {
        return Err(format!("函数 {name} 至少需要 1 个参数"));
    }
    // Arity has been checked, so every branch below has its required arguments.
    let first = arguments
        .first()
        .copied()
        .ok_or_else(|| "缺少函数参数".to_string())?;
    if matches!(name_lower.as_str(), "min" | "max") {
        let mut selected = first;
        for &candidate in arguments.iter().skip(1) {
            let ordering = match (candidate, selected) {
                (Number::Integer(a), Number::Integer(b)) => a.cmp(&b),
                _ => candidate.as_float().total_cmp(&selected.as_float()),
            };
            if (name_lower == "min" && ordering.is_lt())
                || (name_lower == "max" && ordering.is_gt())
            {
                selected = candidate;
            }
        }
        return Ok(selected);
    }
    if name_lower == "pow" {
        let second = arguments
            .get(1)
            .copied()
            .ok_or_else(|| "pow 需要 2 个参数".to_string())?;
        if let (Number::Integer(base), Number::Integer(exponent)) = (first, second)
            && exponent >= 0
        {
            return integer_power(base, exponent);
        }
        if first.as_float() == 0.0 && second.as_float() < 0.0 {
            return Err("零不能取负数次幂（除数不能为零）".into());
        }
        return Number::float(first.as_float().powf(second.as_float()));
    }
    if let Number::Integer(value) = first {
        match name_lower.as_str() {
            "abs" => return checked_integer(value.checked_abs()),
            "floor" | "ceil" | "round" => return Ok(first),
            _ => {}
        }
    }
    let value = first.as_float();
    let angle = if radians { value } else { value.to_radians() };
    Number::float(match name_lower.as_str() {
        "sin" => angle.sin(),
        "cos" => angle.cos(),
        "tan" => angle.tan(),
        "exp" => value.exp(),
        "ln" | "log" if value <= 0.0 => return Err(format!("函数 {name} 的参数必须大于零")),
        "ln" => value.ln(),
        "log" => value.log10(),
        "abs" => value.abs(),
        "sqrt" if value < 0.0 => return Err("sqrt 的参数不能为负数".into()),
        "sqrt" => value.sqrt(),
        "floor" => value.floor(),
        "ceil" => value.ceil(),
        "round" => value.round(),
        _ => return Err(format!("未知函数：{name}")),
    })
}

fn format_result(
    value: Number,
    assigned_variable: Option<String>,
    variables: BTreeMap<String, String>,
) -> CalculationResult {
    let integer = value.exact_integer().ok();
    let float = value.as_float();
    let float32 = float as f32;
    let float32_text = if float32.is_finite() {
        let mut text = float32.to_string();
        if !text.contains('.') && !text.contains('e') && !text.contains('E') {
            text.push_str(".0");
        }
        text
    } else {
        "溢出".into()
    };
    let code = integer.and_then(|integer| u32::try_from(integer).ok());
    let ascii = match code {
        Some(code @ 0..=127) => ascii_character(code),
        _ => UNAVAILABLE.into(),
    };
    let ebcdic = match code {
        Some(code @ 0..=255) => char::from_u32(u32::from(IBM037[code as usize]))
            .map(display_character)
            .unwrap_or_else(|| UNAVAILABLE.into()),
        _ => UNAVAILABLE.into(),
    };
    let unicode = code
        .and_then(char::from_u32)
        .map(display_character)
        .unwrap_or_else(|| UNAVAILABLE.into());
    CalculationResult {
        decimal: value.canonical(),
        hex: integer
            .map(|value| format!("{:X}", value as u64))
            .unwrap_or_else(|| UNAVAILABLE.into()),
        octal: integer
            .map(|value| format!("{:o}", value as u64))
            .unwrap_or_else(|| UNAVAILABLE.into()),
        binary: integer
            .map(|value| format!("{:b}", value as u64))
            .unwrap_or_else(|| UNAVAILABLE.into()),
        float32: float32_text,
        float64: float_string(float),
        ascii,
        ebcdic,
        unicode,
        kind: match value {
            Number::Integer(_) => "integer",
            Number::Float(_) => "float",
        }
        .into(),
        assigned_variable,
        variables,
    }
}

fn display_character(character: char) -> String {
    if character.is_control() {
        character.escape_debug().to_string()
    } else {
        character.to_string()
    }
}

fn ascii_character(code: u32) -> String {
    const CONTROL_NAMES: [&str; 32] = [
        "NUL", "SOH", "STX", "ETX", "EOT", "ENQ", "ACK", "BEL", "BS", "HT", "LF", "VT", "FF", "CR",
        "SO", "SI", "DLE", "DC1", "DC2", "DC3", "DC4", "NAK", "SYN", "ETB", "CAN", "EM", "SUB",
        "ESC", "FS", "GS", "RS", "US",
    ];
    match code {
        0..=31 => format!(
            "{} ({})",
            char::from_u32(0x2400 + code).unwrap_or('�'),
            CONTROL_NAMES[code as usize]
        ),
        32 => "␠ (SPACE)".into(),
        127 => "␡ (DEL)".into(),
        _ => char::from_u32(code)
            .map(|character| character.to_string())
            .unwrap_or_else(|| UNAVAILABLE.into()),
    }
}

// IBM code page 037, indexed by the original byte, including all control codes.
const IBM037: [u16; 256] = [
    0x0000, 0x0001, 0x0002, 0x0003, 0x009C, 0x0009, 0x0086, 0x007F, 0x0097, 0x008D, 0x008E, 0x000B,
    0x000C, 0x000D, 0x000E, 0x000F, 0x0010, 0x0011, 0x0012, 0x0013, 0x009D, 0x0085, 0x0008, 0x0087,
    0x0018, 0x0019, 0x0092, 0x008F, 0x001C, 0x001D, 0x001E, 0x001F, 0x0080, 0x0081, 0x0082, 0x0083,
    0x0084, 0x000A, 0x0017, 0x001B, 0x0088, 0x0089, 0x008A, 0x008B, 0x008C, 0x0005, 0x0006, 0x0007,
    0x0090, 0x0091, 0x0016, 0x0093, 0x0094, 0x0095, 0x0096, 0x0004, 0x0098, 0x0099, 0x009A, 0x009B,
    0x0014, 0x0015, 0x009E, 0x001A, 0x0020, 0x00A0, 0x00E2, 0x00E4, 0x00E0, 0x00E1, 0x00E3, 0x00E5,
    0x00E7, 0x00F1, 0x00A2, 0x002E, 0x003C, 0x0028, 0x002B, 0x007C, 0x0026, 0x00E9, 0x00EA, 0x00EB,
    0x00E8, 0x00ED, 0x00EE, 0x00EF, 0x00EC, 0x00DF, 0x0021, 0x0024, 0x002A, 0x0029, 0x003B, 0x00AC,
    0x002D, 0x002F, 0x00C2, 0x00C4, 0x00C0, 0x00C1, 0x00C3, 0x00C5, 0x00C7, 0x00D1, 0x00A6, 0x002C,
    0x0025, 0x005F, 0x003E, 0x003F, 0x00F8, 0x00C9, 0x00CA, 0x00CB, 0x00C8, 0x00CD, 0x00CE, 0x00CF,
    0x00CC, 0x0060, 0x003A, 0x0023, 0x0040, 0x0027, 0x003D, 0x0022, 0x00D8, 0x0061, 0x0062, 0x0063,
    0x0064, 0x0065, 0x0066, 0x0067, 0x0068, 0x0069, 0x00AB, 0x00BB, 0x00F0, 0x00FD, 0x00FE, 0x00B1,
    0x00B0, 0x006A, 0x006B, 0x006C, 0x006D, 0x006E, 0x006F, 0x0070, 0x0071, 0x0072, 0x00AA, 0x00BA,
    0x00E6, 0x00B8, 0x00C6, 0x00A4, 0x00B5, 0x007E, 0x0073, 0x0074, 0x0075, 0x0076, 0x0077, 0x0078,
    0x0079, 0x007A, 0x00A1, 0x00BF, 0x00D0, 0x00DD, 0x00DE, 0x00AE, 0x005E, 0x00A3, 0x00A5, 0x00B7,
    0x00A9, 0x00A7, 0x00B6, 0x00BC, 0x00BD, 0x00BE, 0x005B, 0x005D, 0x00AF, 0x00A8, 0x00B4, 0x00D7,
    0x007B, 0x0041, 0x0042, 0x0043, 0x0044, 0x0045, 0x0046, 0x0047, 0x0048, 0x0049, 0x00AD, 0x00F4,
    0x00F6, 0x00F2, 0x00F3, 0x00F5, 0x007D, 0x004A, 0x004B, 0x004C, 0x004D, 0x004E, 0x004F, 0x0050,
    0x0051, 0x0052, 0x00B9, 0x00FB, 0x00FC, 0x00F9, 0x00FA, 0x00FF, 0x005C, 0x00F7, 0x0053, 0x0054,
    0x0055, 0x0056, 0x0057, 0x0058, 0x0059, 0x005A, 0x00B2, 0x00D4, 0x00D6, 0x00D2, 0x00D3, 0x00D5,
    0x0030, 0x0031, 0x0032, 0x0033, 0x0034, 0x0035, 0x0036, 0x0037, 0x0038, 0x0039, 0x00B3, 0x00DB,
    0x00DC, 0x00D9, 0x00DA, 0x009F,
];

#[cfg(test)]
mod tests {
    use super::*;

    fn evaluate(expression: &str) -> Result<CalculationResult, String> {
        calculate(CalculateRequest {
            expression: expression.into(),
            variables: BTreeMap::new(),
            angle_mode: "deg".into(),
        })
    }

    fn convert(value: &str, radix: u32) -> Result<CalculationResult, String> {
        convert_base(ConvertRequest {
            value: value.into(),
            radix,
            float32: false,
        })
    }

    #[test]
    fn precedence_and_associativity() {
        for (expression, expected) in [
            ("2 + 3 * 4", "14"),
            ("(2 + 3) * 4", "20"),
            ("20 - 5 - 3", "12"),
            ("48 / 4 / 3", "4"),
            ("1 << 2 + 1", "8"),
            ("7 & 3 ^ 1 | 8", "10"),
            ("~0 & 0xFF", "255"),
            ("-2 * -3 + +4", "10"),
        ] {
            assert_eq!(
                evaluate(expression).unwrap().decimal,
                expected,
                "{expression}"
            );
        }
    }

    #[test]
    fn screenshot_shift() {
        let result = evaluate("0x44 >> 2").unwrap();
        assert_eq!(result.decimal, "17");
        assert_eq!(result.hex, "11");
        assert_eq!(result.octal, "21");
        assert_eq!(result.binary, "10001");
        assert_eq!(result.kind, "integer");
    }

    #[test]
    fn assignments_are_sequential_and_ans_tracks_each_statement() {
        let result = evaluate("x = 0x44\r\ny = x >> 2\ny + ans\nz = 2.0\nx + y").unwrap();
        assert_eq!(result.decimal, "85");
        assert_eq!(result.assigned_variable.as_deref(), Some("z"));
        assert_eq!(result.variables.get("x").map(String::as_str), Some("68"));
        assert_eq!(result.variables.get("y").map(String::as_str), Some("17"));
        assert_eq!(result.variables.get("z").map(String::as_str), Some("2.0"));
        assert_eq!(result.variables.get("ans").map(String::as_str), Some("85"));
        assert!(evaluate("x = 3\ny = 1 / 0").is_err());
        assert!(evaluate("x = 3 unexpected").is_err());
    }

    #[test]
    fn supplied_variables_preserve_type_and_case() {
        let variables = BTreeMap::from([
            ("x".into(), "9007199254740993".into()),
            ("X".into(), "2.0".into()),
            ("ans".into(), "4".into()),
        ]);
        let result = calculate(CalculateRequest {
            expression: "x + ans\nX + 1".into(),
            variables,
            angle_mode: String::new(),
        })
        .unwrap();
        assert_eq!(result.decimal, "3.0");
        assert_eq!(result.kind, "float");
        assert_eq!(
            result.variables.get("x").map(String::as_str),
            Some("9007199254740993")
        );
        assert!(evaluate("unknown + 1").unwrap_err().contains("未定义"));
        assert!(evaluate("PI = 2").is_err());
    }

    #[test]
    fn integer_precision_is_not_routed_through_float() {
        for (expression, expected) in [
            ("9007199254740993 + 2", "9007199254740995"),
            ("9007199254740993 / 3", "3002399751580331"),
            (
                "min(9007199254740993, 9007199254740992)",
                "9007199254740992",
            ),
            (
                "max(9007199254740992, 9007199254740993)",
                "9007199254740993",
            ),
            ("pow(3, 34)", "16677181699666569"),
            ("floor(9007199254740993)", "9007199254740993"),
        ] {
            assert_eq!(
                evaluate(expression).unwrap().decimal,
                expected,
                "{expression}"
            );
        }
    }

    #[test]
    fn signed_limits_and_checked_overflow() {
        assert_eq!(
            evaluate("-9223372036854775808").unwrap().decimal,
            i64::MIN.to_string()
        );
        assert_eq!(
            evaluate("9223372036854775807").unwrap().decimal,
            i64::MAX.to_string()
        );
        assert_eq!(
            evaluate("pow(-2, 63)").unwrap().decimal,
            i64::MIN.to_string()
        );
        assert_eq!(
            evaluate("pow(-1, 9223372036854775807)").unwrap().decimal,
            "-1"
        );
        for expression in [
            "9223372036854775808",
            "9223372036854775807 + 1",
            "-9223372036854775808 - 1",
            "9223372036854775807 * 2",
            "-(-9223372036854775808)",
            "-9223372036854775808 / -1",
            "-9223372036854775808 % -1",
            "abs(-9223372036854775808)",
            "pow(2, 63)",
            "pow(2, 9223372036854775807)",
        ] {
            assert!(
                evaluate(expression).unwrap_err().contains("溢出"),
                "{expression}"
            );
        }
    }

    #[test]
    fn bit_patterns_and_hex_suffixes() {
        for (expression, expected) in [
            ("FFh", "255"),
            ("ffH + 1h", "256"),
            ("0o10 + 0b11", "11"),
            ("0xFFFFFFFFFFFFFFFF", "-1"),
            ("FFFFFFFFFFFFFFFFh", "-1"),
            ("0x8000000000000000", "-9223372036854775808"),
            (
                "0b1111111111111111111111111111111111111111111111111111111111111111",
                "-1",
            ),
        ] {
            assert_eq!(
                evaluate(expression).unwrap().decimal,
                expected,
                "{expression}"
            );
        }
        let minus_one = evaluate("-1").unwrap();
        assert_eq!(minus_one.hex, "FFFFFFFFFFFFFFFF");
        assert_eq!(minus_one.binary, "1".repeat(64));
        assert!(evaluate("0x10000000000000000").is_err());
    }

    #[test]
    fn shifts_are_signed_and_counts_are_validated() {
        for (expression, expected) in [
            ("-8 >> 2", "-2"),
            ("1 << 63", "-9223372036854775808"),
            ("0x8000000000000000 << 1", "0"),
            ("-1 >> 63", "-1"),
            ("8.0 >> 1.0", "4"),
        ] {
            assert_eq!(
                evaluate(expression).unwrap().decimal,
                expected,
                "{expression}"
            );
        }
        for expression in [
            "1 << -1",
            "1 >> 64",
            "1 << 1.5",
            "1.2 & 1",
            "9223372036854775808.0 | 0",
            "1 << 1e100",
        ] {
            assert!(evaluate(expression).is_err(), "{expression}");
        }
        assert_eq!(
            evaluate("-9223372036854775808.0 | 0").unwrap().decimal,
            i64::MIN.to_string()
        );
    }

    #[test]
    fn division_and_float_storage() {
        assert_eq!(evaluate("6 / 3").unwrap().kind, "integer");
        let fractional = evaluate("5 / 2").unwrap();
        assert_eq!(fractional.decimal, "2.5");
        assert_eq!(fractional.kind, "float");
        assert_eq!(fractional.hex, UNAVAILABLE);
        assert_eq!(evaluate("1e2 + .5").unwrap().decimal, "100.5");
        assert_eq!(evaluate("2.0 + 2").unwrap().decimal, "4.0");
        assert_eq!(evaluate("-0.0").unwrap().decimal, "-0.0");
        assert_eq!(evaluate("pow(2, -3)").unwrap().decimal, "0.125");
        for expression in ["1 / 0", "1.0 / -0.0", "1 % 0", "1.0 % 0.0", "pow(0, -1)"] {
            assert!(
                evaluate(expression).unwrap_err().contains("零"),
                "{expression}"
            );
        }
        for expression in [
            "1e309",
            "1e308 * 10",
            "sqrt(-1)",
            "ln(0)",
            "log(-2)",
            "exp(1000)",
            "pow(-1, 0.5)",
        ] {
            assert!(evaluate(expression).is_err(), "{expression}");
        }
    }

    #[test]
    fn functions_constants_and_angle_modes() {
        assert!((evaluate("sin(30)").unwrap().decimal.parse::<f64>().unwrap() - 0.5).abs() < 1e-12);
        let result = calculate(CalculateRequest {
            expression: "cos(PI) + sin(pi / 2)".into(),
            variables: BTreeMap::new(),
            angle_mode: "RAD".into(),
        })
        .unwrap();
        assert!(result.decimal.parse::<f64>().unwrap().abs() < 1e-12);
        for (expression, expected) in [
            ("sqrt(9)", "3.0"),
            ("ln(E)", "1.0"),
            ("log(100)", "2.0"),
            ("abs(-3)", "3"),
            ("floor(2.9)", "2.0"),
            ("ceil(-2.9)", "-2.0"),
            ("round(-2.5)", "-3.0"),
            ("min(9, 2, 5)", "2"),
            ("max(-1, -4)", "-1"),
        ] {
            assert_eq!(
                evaluate(expression).unwrap().decimal,
                expected,
                "{expression}"
            );
        }
        for expression in [
            "sin()",
            "pow(2)",
            "pow(2, 3, 4)",
            "min()",
            "sqrt(1, 2)",
            "missing(1)",
        ] {
            assert!(evaluate(expression).is_err(), "{expression}");
        }
    }

    #[test]
    fn base_conversion_and_signed_patterns() {
        for (text, radix, expected) in [
            ("FFFFFFFFFFFFFFFF", 16, "-1"),
            ("FFh", 16, "255"),
            ("0x44", 16, "68"),
            ("-FF", 16, "-255"),
            ("10001", 2, "17"),
            ("0o21", 8, "17"),
            ("-9223372036854775808", 10, "-9223372036854775808"),
            ("2.5", 10, "2.5"),
            ("2.0", 10, "2.0"),
            ("1e2", 10, "100.0"),
        ] {
            assert_eq!(convert(text, radix).unwrap().decimal, expected);
        }
        for (text, radix) in [
            ("2", 2),
            ("8", 8),
            ("GG", 16),
            ("18446744073709551616", 10),
            ("1", 3),
            ("", 10),
            ("NaN", 10),
            ("inf", 10),
            ("2 + 2", 10),
        ] {
            assert!(convert(text, radix).is_err(), "{text} in base {radix}");
        }
        assert_eq!(
            convert("9223372036854775808.0", 10).unwrap().hex,
            UNAVAILABLE
        );
        assert_eq!(convert("2.0", 10).unwrap().hex, "2");
    }

    #[test]
    fn float32_editing_and_overflow_display() {
        let result = convert_base(ConvertRequest {
            value: "0.1".into(),
            radix: 10,
            float32: true,
        })
        .unwrap();
        assert_eq!(result.decimal, "0.10000000149011612");
        assert_eq!(result.float32, "0.1");
        assert_eq!(result.kind, "float");
        assert_eq!(convert("1e100", 10).unwrap().float32, "溢出");
        assert!(
            convert_base(ConvertRequest {
                value: "1e100".into(),
                radix: 10,
                float32: true
            })
            .is_err()
        );
    }

    #[test]
    fn characters_include_controls_unicode_and_complete_ebcdic() {
        assert_eq!(evaluate("65").unwrap().ascii, "A");
        assert_eq!(evaluate("193").unwrap().ebcdic, "A");
        assert_eq!(evaluate("0xF0").unwrap().ebcdic, "0");
        assert_eq!(evaluate("0xB7").unwrap().ebcdic, "¼");
        assert_eq!(evaluate("10").unwrap().ascii, "␊ (LF)");
        assert_eq!(evaluate("10").unwrap().unicode, "\\n");
        assert_eq!(evaluate("127").unwrap().ascii, "␡ (DEL)");
        assert_eq!(evaluate("0x4E2D").unwrap().unicode, "中");
        assert_eq!(evaluate("0x1F600").unwrap().unicode, "😀");
        for expression in ["-1", "0xD800", "0x110000", "1.5"] {
            assert_eq!(evaluate(expression).unwrap().unicode, UNAVAILABLE);
        }
    }

    #[test]
    fn multiline_parentheses_and_separators() {
        assert_eq!(
            evaluate("\n; x = (1 +\n 2);\nmax(x,\n 4)\n")
                .unwrap()
                .decimal,
            "4"
        );
        assert_eq!(
            evaluate("x = 1; x + 2")
                .unwrap()
                .variables
                .get("x")
                .map(String::as_str),
            Some("1")
        );
    }

    #[test]
    fn malformed_inputs_and_limits_return_errors_without_panicking() {
        for expression in [
            "", " \n;", "(", ")", "()", "1 +", "1 2", "2(3)", "1,2", "x =", "= 1", "1 = 2",
            "1.2.3", "1e+", "0x", "0b2", "1 < 2", "sqrt(1,)", "中", "\0",
        ] {
            assert!(evaluate(expression).is_err(), "{expression:?}");
        }
        assert!(evaluate(&"1".repeat(MAX_INPUT_LENGTH + 1)).is_err());
        assert!(
            evaluate(&format!(
                "{}1{}",
                "(".repeat(MAX_DEPTH + 1),
                ")".repeat(MAX_DEPTH + 1)
            ))
            .is_err()
        );
        assert!(evaluate(&format!("{}1", "-".repeat(MAX_DEPTH + 1))).is_err());
        assert!(
            evaluate(&format!(
                "{}1{}",
                "abs(".repeat(MAX_DEPTH + 1),
                ")".repeat(MAX_DEPTH + 1)
            ))
            .is_err()
        );
        let long_flat = std::iter::repeat_n("1", 4000).collect::<Vec<_>>().join("+");
        assert_eq!(evaluate(&long_flat).unwrap().decimal, "4000");
    }
}
