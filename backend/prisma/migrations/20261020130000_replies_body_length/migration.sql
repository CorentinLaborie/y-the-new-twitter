-- Reply text is 1 to 280 characters (D3), as question text (R1). varchar(280) only caps the length: this adds the minimum.
ALTER TABLE "replies" ADD CONSTRAINT "replies_body_length_check" CHECK (char_length("body") BETWEEN 1 AND 280);
