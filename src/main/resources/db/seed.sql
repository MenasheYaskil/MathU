-- ============================================================
-- MathU Racing Game — Seed Data
-- Run manually AFTER schema.sql:
--   mysql -u root -p mathu_racegame < seed.sql
-- Safe to re-run: INSERT IGNORE skips rows that already exist.
-- Do NOT run this file during Spring Boot startup.
-- ============================================================

USE mathu_racegame;

START TRANSACTION;

-- ============================================================
-- DEMO ACCOUNTS (development / classroom demo only)
--
--   teacher_demo  /  TeachMe2024!   (TEACHER)
--   student_alice /  Learn2024!     (STUDENT)
--   student_bob   /  Learn2024!     (STUDENT)
--   student_charlie / Learn2024!    (STUDENT)
--   student_diana /  Learn2024!     (STUDENT)
--   student_evan  /  Learn2024!     (STUDENT)
--
-- Passwords are BCrypt-hashed (strength 10). Change before
-- deploying to any non-development environment.
-- ============================================================

INSERT IGNORE INTO users (username, email, password_hash, role) VALUES
    ('teacher_demo',    'teacher@demo.local',  '$2a$10$MXphcl1bhv6Z62zNu.EEfOcrLdIXM.JSqCknHjrCzMo8FxIKkKtEm', 'TEACHER'),
    ('student_alice',   'alice@demo.local',    '$2a$10$.eppzq76kVWjHXLWIHZc0.DT7yT6Awe8rbKyruYnQlGIrysnz5qQe', 'STUDENT'),
    ('student_bob',     'bob@demo.local',      '$2a$10$.eppzq76kVWjHXLWIHZc0.DT7yT6Awe8rbKyruYnQlGIrysnz5qQe', 'STUDENT'),
    ('student_charlie', 'charlie@demo.local',  '$2a$10$.eppzq76kVWjHXLWIHZc0.DT7yT6Awe8rbKyruYnQlGIrysnz5qQe', 'STUDENT'),
    ('student_diana',   'diana@demo.local',    '$2a$10$.eppzq76kVWjHXLWIHZc0.DT7yT6Awe8rbKyruYnQlGIrysnz5qQe', 'STUDENT'),
    ('student_evan',    'evan@demo.local',     '$2a$10$.eppzq76kVWjHXLWIHZc0.DT7yT6Awe8rbKyruYnQlGIrysnz5qQe', 'STUDENT');

-- ============================================================
-- template_variables: NUMBER
--
-- Grouped by intended difficulty range:
--   D1–D2 (easy addition/subtraction): small numbers, single-digit ops
--   D3     (multiplication):           times-table range 2–12
--   D4–D5  (harder ops):               extends to 20, 25, 50, 100
-- All numbers share a single pool — difficulty is shaped primarily
-- by which operators the D-level templates permit.
-- ============================================================

INSERT IGNORE INTO template_variables (variable_type, value, metadata) VALUES
    -- Single digits (D1–D5)
    ('NUMBER', '1',  '{"range": [1, 1]}'),
    ('NUMBER', '2',  '{"range": [2, 2]}'),
    ('NUMBER', '3',  '{"range": [3, 3]}'),
    ('NUMBER', '4',  '{"range": [4, 4]}'),
    ('NUMBER', '5',  '{"range": [5, 5]}'),
    ('NUMBER', '6',  '{"range": [6, 6]}'),
    ('NUMBER', '7',  '{"range": [7, 7]}'),
    ('NUMBER', '8',  '{"range": [8, 8]}'),
    ('NUMBER', '9',  '{"range": [9, 9]}'),
    -- Two-digit, times-table range (D3+)
    ('NUMBER', '10', '{"range": [10, 10]}'),
    ('NUMBER', '11', '{"range": [11, 11]}'),
    ('NUMBER', '12', '{"range": [12, 12]}'),
    ('NUMBER', '13', '{"range": [13, 13]}'),
    ('NUMBER', '14', '{"range": [14, 14]}'),
    ('NUMBER', '15', '{"range": [15, 15]}'),
    ('NUMBER', '16', '{"range": [16, 16]}'),
    ('NUMBER', '17', '{"range": [17, 17]}'),
    ('NUMBER', '18', '{"range": [18, 18]}'),
    ('NUMBER', '19', '{"range": [19, 19]}'),
    -- Round numbers for larger sums/products (D4–D5)
    ('NUMBER', '20', '{"range": [20, 20]}'),
    ('NUMBER', '25', '{"range": [25, 25]}'),
    ('NUMBER', '30', '{"range": [30, 30]}'),
    ('NUMBER', '40', '{"range": [40, 40]}'),
    ('NUMBER', '50', '{"range": [50, 50]}'),
    ('NUMBER', '100','{"range": [100, 100]}');

-- ============================================================
-- template_variables: OPERATOR
-- Excludes ÷ to guarantee integer answers at generation time.
-- ============================================================

INSERT IGNORE INTO template_variables (variable_type, value, metadata) VALUES
    ('OPERATOR', '+', '{"symbol": "+", "operation": "addition"}'),
    ('OPERATOR', '-', '{"symbol": "-", "operation": "subtraction"}'),
    ('OPERATOR', '×', '{"symbol": "×", "operation": "multiplication"}');

-- ============================================================
-- template_variables: NAME / ACTION / OBJECT / AMOUNT
-- Seeded now so the schema constraint is satisfied; these power
-- WORD_PROBLEM templates when that subject area is activated.
-- ============================================================

INSERT IGNORE INTO template_variables (variable_type, value) VALUES
    ('NAME', 'Alice'),  ('NAME', 'Bob'),    ('NAME', 'Carlos'),
    ('NAME', 'Diana'),  ('NAME', 'Evan'),   ('NAME', 'Fatima'),
    ('NAME', 'George'), ('NAME', 'Hannah'), ('NAME', 'Ivan'),
    ('NAME', 'Julia');

INSERT IGNORE INTO template_variables (variable_type, value) VALUES
    ('ACTION', 'collected'), ('ACTION', 'bought'),  ('ACTION', 'found'),
    ('ACTION', 'sold'),      ('ACTION', 'gave away'),('ACTION', 'packed'),
    ('ACTION', 'received'),  ('ACTION', 'shared');

INSERT IGNORE INTO template_variables (variable_type, value) VALUES
    ('OBJECT', 'apples'),  ('OBJECT', 'books'),   ('OBJECT', 'coins'),
    ('OBJECT', 'stickers'),('OBJECT', 'pencils'),  ('OBJECT', 'cards'),
    ('OBJECT', 'marbles'), ('OBJECT', 'stamps'),   ('OBJECT', 'badges');

INSERT IGNORE INTO template_variables (variable_type, value) VALUES
    ('AMOUNT', '3'),  ('AMOUNT', '4'),  ('AMOUNT', '5'),
    ('AMOUNT', '6'),  ('AMOUNT', '7'),  ('AMOUNT', '8'),
    ('AMOUNT', '9'),  ('AMOUNT', '10'), ('AMOUNT', '12'),
    ('AMOUNT', '15'), ('AMOUNT', '20'), ('AMOUNT', '25');

-- ============================================================
-- question_templates: ARITHMETIC
--
-- All D1–D5 templates resolve to "N op N = ?" after variable
-- substitution, which QuestionGeneratorService can auto-compute.
--
-- D1 — addition only          (youngest students, easy wins)
-- D2 — addition + subtraction (slightly more challenge)
-- D3 — multiplication only    (times-table fluency)
-- D4 — multiplication + mixed (mixed operations)
-- D5 — any operator via       {OPERATOR} placeholder
--
-- Multiple identical-format rows per difficulty intentionally
-- increase random selection entropy in ORDER BY RAND() queries.
-- ============================================================

-- D1: addition only
INSERT IGNORE INTO question_templates (template_text, subject_area, difficulty_level) VALUES
    ('{NUMBER} + {NUMBER} = ?', 'ARITHMETIC', 1),
    ('{NUMBER} + {NUMBER} = ?', 'ARITHMETIC', 1),
    ('{NUMBER} + {NUMBER} = ?', 'ARITHMETIC', 1),
    ('{NUMBER} + {NUMBER} = ?', 'ARITHMETIC', 1),
    ('{NUMBER} + {NUMBER} = ?', 'ARITHMETIC', 1);

-- D2: addition and subtraction
INSERT IGNORE INTO question_templates (template_text, subject_area, difficulty_level) VALUES
    ('{NUMBER} + {NUMBER} = ?', 'ARITHMETIC', 2),
    ('{NUMBER} + {NUMBER} = ?', 'ARITHMETIC', 2),
    ('{NUMBER} + {NUMBER} = ?', 'ARITHMETIC', 2),
    ('{NUMBER} - {NUMBER} = ?', 'ARITHMETIC', 2),
    ('{NUMBER} - {NUMBER} = ?', 'ARITHMETIC', 2),
    ('{NUMBER} - {NUMBER} = ?', 'ARITHMETIC', 2);

-- D3: multiplication only (times-table fluency)
INSERT IGNORE INTO question_templates (template_text, subject_area, difficulty_level) VALUES
    ('{NUMBER} × {NUMBER} = ?', 'ARITHMETIC', 3),
    ('{NUMBER} × {NUMBER} = ?', 'ARITHMETIC', 3),
    ('{NUMBER} × {NUMBER} = ?', 'ARITHMETIC', 3),
    ('{NUMBER} × {NUMBER} = ?', 'ARITHMETIC', 3),
    ('{NUMBER} × {NUMBER} = ?', 'ARITHMETIC', 3);

-- D4: multiplication + mixed (fixed operators, no {OPERATOR})
INSERT IGNORE INTO question_templates (template_text, subject_area, difficulty_level) VALUES
    ('{NUMBER} × {NUMBER} = ?', 'ARITHMETIC', 4),
    ('{NUMBER} × {NUMBER} = ?', 'ARITHMETIC', 4),
    ('{NUMBER} × {NUMBER} = ?', 'ARITHMETIC', 4),
    ('{NUMBER} + {NUMBER} = ?', 'ARITHMETIC', 4),
    ('{NUMBER} - {NUMBER} = ?', 'ARITHMETIC', 4),
    ('{NUMBER} - {NUMBER} = ?', 'ARITHMETIC', 4);

-- D5: any operator via {OPERATOR} — broadest challenge range
INSERT IGNORE INTO question_templates (template_text, subject_area, difficulty_level) VALUES
    ('{NUMBER} {OPERATOR} {NUMBER} = ?', 'ARITHMETIC', 5),
    ('{NUMBER} {OPERATOR} {NUMBER} = ?', 'ARITHMETIC', 5),
    ('{NUMBER} {OPERATOR} {NUMBER} = ?', 'ARITHMETIC', 5),
    ('{NUMBER} {OPERATOR} {NUMBER} = ?', 'ARITHMETIC', 5),
    ('{NUMBER} {OPERATOR} {NUMBER} = ?', 'ARITHMETIC', 5),
    ('{NUMBER} {OPERATOR} {NUMBER} = ?', 'ARITHMETIC', 5);

COMMIT;
