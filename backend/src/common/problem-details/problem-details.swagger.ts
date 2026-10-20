import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiProperty, ApiResponse, getSchemaPath } from '@nestjs/swagger';

/** The Problem Details body of section 8.4, as the contract documents it. ProblemDetailsFilter produces it. */
class ProblemDetailsDto {
  @ApiProperty({ example: 'about:blank' })
  readonly type!: string;

  @ApiProperty({ example: 'Unprocessable Entity' })
  readonly title!: string;

  @ApiProperty({ example: 422 })
  readonly status!: number;

  @ApiProperty({ example: 'La question doit contenir de 1 à 280 caractères.' })
  readonly detail!: string;

  @ApiProperty({ example: '/api/v1/questions' })
  readonly instance!: string;

  @ApiProperty({ required: false })
  readonly requestId?: string;

  @ApiProperty({
    required: false,
    example: 'account_suspended',
    description:
      'Stable machine-readable code of the refusal, when it has one: account_pending_verification, account_suspended, account_pending_deletion or csrf_invalid. The detail text is in French and may change.',
  })
  readonly code?: string;
}

/** One documented error response of a route, with the application/problem+json media type. */
export function problemDetailsResponse(status: number, description: string) {
  return applyDecorators(
    ApiExtraModels(ProblemDetailsDto),
    ApiResponse({
      status,
      description,
      content: { 'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } },
    }),
  );
}
