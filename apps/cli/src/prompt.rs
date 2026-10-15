use std::io::{self, BufRead, IsTerminal, Write};

pub struct Choice {
    pub label: String,
    pub value: String,
}

pub fn can_prompt() -> bool {
    io::stdin().is_terminal() && io::stderr().is_terminal()
}

pub fn select(
    message: &str,
    choices: &[Choice],
    default_value: Option<&str>,
) -> Result<String, String> {
    let stdin = io::stdin();
    let mut input = stdin.lock();
    let stderr = io::stderr();
    let mut output = stderr.lock();
    select_from(&mut input, &mut output, message, choices, default_value)
}

pub fn text(message: &str) -> Result<String, String> {
    let stdin = io::stdin();
    let mut input = stdin.lock();
    let stderr = io::stderr();
    let mut output = stderr.lock();
    text_from(&mut input, &mut output, message)
}

fn select_from(
    input: &mut impl BufRead,
    output: &mut impl Write,
    message: &str,
    choices: &[Choice],
    default_value: Option<&str>,
) -> Result<String, String> {
    if choices.is_empty() {
        return Err("Selection requires at least one option".into());
    }
    let default_index = default_value
        .and_then(|value| choices.iter().position(|choice| choice.value == value))
        .unwrap_or(0);
    writeln!(output, "{message}").map_err(prompt_error)?;
    for (index, choice) in choices.iter().enumerate() {
        let marker = if index == default_index { "*" } else { " " };
        writeln!(output, " {marker} {}) {}", index + 1, choice.label).map_err(prompt_error)?;
    }
    loop {
        write!(output, "Select [{}]: ", default_index + 1).map_err(prompt_error)?;
        output.flush().map_err(prompt_error)?;
        let answer = read_line(input)?;
        if answer.is_empty() {
            return Ok(choices[default_index].value.clone());
        }
        if let Ok(index) = answer.parse::<usize>() {
            if let Some(choice) = index.checked_sub(1).and_then(|index| choices.get(index)) {
                return Ok(choice.value.clone());
            }
        }
        writeln!(output, "Choose a number from 1 to {}.", choices.len()).map_err(prompt_error)?;
    }
}

fn text_from(
    input: &mut impl BufRead,
    output: &mut impl Write,
    message: &str,
) -> Result<String, String> {
    write!(output, "{message} ").map_err(prompt_error)?;
    output.flush().map_err(prompt_error)?;
    read_line(input)
}

fn read_line(input: &mut impl BufRead) -> Result<String, String> {
    let mut answer = String::new();
    if input.read_line(&mut answer).map_err(prompt_error)? == 0 {
        return Err("Interactive input closed".into());
    }
    Ok(answer.trim().to_owned())
}

fn prompt_error(error: io::Error) -> String {
    format!("Interactive input failed: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn choices() -> Vec<Choice> {
        vec![
            Choice {
                label: "First".into(),
                value: "first".into(),
            },
            Choice {
                label: "Second".into(),
                value: "second".into(),
            },
        ]
    }

    #[test]
    fn select_uses_configured_default() {
        let mut input = Cursor::new("\n");
        let mut output = Vec::new();
        let selected = select_from(
            &mut input,
            &mut output,
            "Choose:",
            &choices(),
            Some("second"),
        )
        .unwrap();
        assert_eq!(selected, "second");
    }

    #[test]
    fn select_retries_invalid_numbers() {
        let mut input = Cursor::new("8\n1\n");
        let mut output = Vec::new();
        let selected = select_from(&mut input, &mut output, "Choose:", &choices(), None).unwrap();
        assert_eq!(selected, "first");
        assert!(String::from_utf8(output)
            .unwrap()
            .contains("Choose a number from 1 to 2."));
    }
}
