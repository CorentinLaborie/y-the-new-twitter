-- Question text is 1 to 280 characters (R1). varchar(280) only caps the length: this adds the minimum.
ALTER TABLE "questions" ADD CONSTRAINT "questions_body_length_check" CHECK (char_length("body") BETWEEN 1 AND 280);
