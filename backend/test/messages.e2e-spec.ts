import { INestApplication } from '@nestjs/common';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaService } from '../src/database/prisma.service';
import { startApp } from './support/app';
import { BASE, PASSWORD, createAccount, newVisitor } from './support/back-office';
import { resetRateLimits } from './support/rate-limits';
import { startMigratedPostgres } from './support/postgres';

const MESSAGES = `${BASE}/messages`;

/** A user signed in with the password, to write, follow and block. */
async function userSignedIn(app: INestApplication, handle: string) {
  const visitor = await newVisitor(app);
  await visitor.agent
    .post(`${BASE}/auth/login`)
    .set('x-csrf-token', visitor.csrf)
    .send({ email: `${handle}@example.test`, password: PASSWORD })
    .expect(200);
  return visitor;
}

type Visitor = Awaited<ReturnType<typeof userSignedIn>>;

describe('Private messages (e2e, section 9 of the conditions, R14)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    process.env.DATABASE_URL = container.getConnectionUri();
    app = await startApp();
    prisma = app.get(PrismaService);
  }, 180_000);

  beforeEach(async () => {
    await resetRateLimits(app);
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  function start(visitor: Visitor, handle: string, text: string) {
    return visitor.agent.post(`${MESSAGES}/conversations`).set('x-csrf-token', visitor.csrf).send({ handle, text });
  }

  function send(visitor: Visitor, conversationId: string, text: string) {
    return visitor.agent
      .post(`${MESSAGES}/conversations/${conversationId}/messages`)
      .set('x-csrf-token', visitor.csrf)
      .send({ text });
  }

  function answer(visitor: Visitor, conversationId: string, verb: 'accept' | 'decline') {
    return visitor.agent
      .put(`${MESSAGES}/conversations/${conversationId}/${verb}`)
      .set('x-csrf-token', visitor.csrf);
  }

  it('turns a message to a non-follower into a request, that the recipient accepts before any answer (409 until then)', async () => {
    await createAccount(app, 'msg_req_alice');
    await createAccount(app, 'msg_req_bob');
    const alice = await userSignedIn(app, 'msg_req_alice');
    const bob = await userSignedIn(app, 'msg_req_bob');

    const opened = await start(alice, 'msg_req_bob', 'Bonjour Bob').expect(201);
    const conversationId = opened.body.conversationId;

    const requests = await bob.agent.get(`${MESSAGES}/conversations?requests=true`).expect(200);
    expect(requests.body.conversations).toMatchObject([
      { id: conversationId, status: 'pending', initiatedByViewer: false, other: { handle: 'msg_req_alice' } },
    ]);

    await send(alice, conversationId, 'Encore').expect(409);
    await send(bob, conversationId, 'Réponse').expect(409);
    await start(alice, 'msg_req_bob', 'Un second message').expect(409);

    await answer(bob, conversationId, 'accept').expect(204);
    await send(bob, conversationId, 'Réponse').expect(201);

    const inbox = await alice.agent.get(`${MESSAGES}/conversations`).expect(200);
    expect(inbox.body.conversations).toMatchObject([{ id: conversationId, status: 'accepted', unread: true }]);

    const messages = await alice.agent.get(`${MESSAGES}/conversations/${conversationId}/messages`).expect(200);
    expect(messages.body.messages.map((message: { text: string }) => message.text)).toEqual([
      'Réponse',
      'Bonjour Bob',
    ]);
    expect(messages.body.messages[0]).toMatchObject({ mine: false });
    expect(messages.body.messages[1]).toMatchObject({ mine: true });
  });

  it('opens a direct conversation when the recipient already follows the sender', async () => {
    await createAccount(app, 'msg_dir_alice');
    await createAccount(app, 'msg_dir_bob');
    const alice = await userSignedIn(app, 'msg_dir_alice');
    const bob = await userSignedIn(app, 'msg_dir_bob');
    await bob.agent
      .put(`${BASE}/users/msg_dir_alice/follow`)
      .set('x-csrf-token', bob.csrf)
      .expect(200);

    const opened = await start(alice, 'msg_dir_bob', 'Salut').expect(201);
    await send(alice, opened.body.conversationId, 'Encore').expect(201);

    const inbox = await bob.agent.get(`${MESSAGES}/conversations`).expect(200);
    expect(inbox.body.conversations).toMatchObject([
      { id: opened.body.conversationId, status: 'accepted', other: { handle: 'msg_dir_alice' } },
    ]);
    const requests = await bob.agent.get(`${MESSAGES}/conversations?requests=true`).expect(200);
    expect(requests.body.conversations).toEqual([]);
  });

  it('refuses a request once the recipient declines it (409 for every later message)', async () => {
    await createAccount(app, 'msg_dec_alice');
    await createAccount(app, 'msg_dec_bob');
    const alice = await userSignedIn(app, 'msg_dec_alice');
    const bob = await userSignedIn(app, 'msg_dec_bob');
    const opened = await start(alice, 'msg_dec_bob', 'Bonjour').expect(201);

    await answer(bob, opened.body.conversationId, 'decline').expect(204);

    await send(alice, opened.body.conversationId, 'Encore').expect(409);
    await answer(bob, opened.body.conversationId, 'accept').expect(409);
  });

  it('hides the conversation from both sides once one of them blocks the other (R14), and answers 404', async () => {
    await createAccount(app, 'msg_blk_alice');
    await createAccount(app, 'msg_blk_bob');
    const alice = await userSignedIn(app, 'msg_blk_alice');
    const bob = await userSignedIn(app, 'msg_blk_bob');
    const opened = await start(alice, 'msg_blk_bob', 'Bonjour').expect(201);

    await bob.agent.put(`${BASE}/users/msg_blk_alice/block`).set('x-csrf-token', bob.csrf).expect(204);

    await start(alice, 'msg_blk_bob', 'Encore').expect(404);
    await send(alice, opened.body.conversationId, 'Encore').expect(404);
    await bob.agent.get(`${MESSAGES}/conversations?requests=true`).expect(200).expect((response) => {
      expect(response.body.conversations).toEqual([]);
    });
  });

  it('refuses a message to oneself (422), an unknown handle (404), and a text longer than 1000 characters (400)', async () => {
    await createAccount(app, 'msg_chk_alice');
    const alice = await userSignedIn(app, 'msg_chk_alice');

    await start(alice, 'msg_chk_alice', 'Moi').expect(422);
    await start(alice, 'nobody_here', 'Bonjour').expect(404);
    await start(alice, 'msg_chk_alice', 'x'.repeat(1001)).expect(400);
    await start(alice, 'msg_chk_alice', '   ').expect(400);
  });

  it('shows one conversation to its two participants, each with the other account, and answers 404 to the others', async () => {
    await createAccount(app, 'msg_one_alice');
    await createAccount(app, 'msg_one_bob');
    await createAccount(app, 'msg_one_carol');
    const alice = await userSignedIn(app, 'msg_one_alice');
    const bob = await userSignedIn(app, 'msg_one_bob');
    const carol = await userSignedIn(app, 'msg_one_carol');
    const opened = await start(alice, 'msg_one_bob', 'Bonjour').expect(201);
    const path = `${MESSAGES}/conversations/${opened.body.conversationId}`;

    const sender = await alice.agent.get(path).expect(200);
    expect(sender.body).toMatchObject({
      id: opened.body.conversationId,
      status: 'accepted',
      initiatedByViewer: true,
      other: { handle: 'msg_one_bob' },
    });
    const recipient = await bob.agent.get(path).expect(200);
    expect(recipient.body).toMatchObject({ status: 'pending', initiatedByViewer: false, other: { handle: 'msg_one_alice' } });
    await carol.agent.get(path).expect(404);
  });

  it('answers 404 to a viewer who takes no part in the conversation', async () => {
    await createAccount(app, 'msg_out_alice');
    await createAccount(app, 'msg_out_bob');
    await createAccount(app, 'msg_out_carol');
    const alice = await userSignedIn(app, 'msg_out_alice');
    const carol = await userSignedIn(app, 'msg_out_carol');
    const opened = await start(alice, 'msg_out_bob', 'Bonjour').expect(201);

    await carol.agent.get(`${MESSAGES}/conversations/${opened.body.conversationId}/messages`).expect(404);
    await send(carol, opened.body.conversationId, 'Intrus').expect(404);
    await answer(carol, opened.body.conversationId, 'accept').expect(404);
  });

  it('keeps the messages of a deleted or suspended account out of the inbox (its other side is not visible)', async () => {
    await createAccount(app, 'msg_sus_alice');
    await createAccount(app, 'msg_sus_bob');
    const alice = await userSignedIn(app, 'msg_sus_alice');
    const bob = await userSignedIn(app, 'msg_sus_bob');
    const opened = await start(alice, 'msg_sus_bob', 'Bonjour').expect(201);
    await answer(bob, opened.body.conversationId, 'accept').expect(204);
    await prisma.user.updateMany({ where: { handle: 'msg_sus_alice' }, data: { status: 'suspended' } });

    const inbox = await bob.agent.get(`${MESSAGES}/conversations`).expect(200);
    expect(inbox.body.conversations).toEqual([]);
    await send(bob, opened.body.conversationId, 'Encore').expect(404);
  });

  function mutation(visitor: Visitor, conversationId: string, path: 'mute' | 'archive', method: 'put' | 'delete') {
    return visitor.agent[method](`${MESSAGES}/conversations/${conversationId}/${path}`).set('x-csrf-token', visitor.csrf);
  }

  it('archives a conversation for the viewer only: hidden by default, listed with archived=true, back once unarchived', async () => {
    await createAccount(app, 'msg_arc_alice');
    await createAccount(app, 'msg_arc_bob');
    const alice = await userSignedIn(app, 'msg_arc_alice');
    const bob = await userSignedIn(app, 'msg_arc_bob');
    await bob.agent.put(`${BASE}/users/msg_arc_alice/follow`).set('x-csrf-token', bob.csrf).expect(200);
    const opened = await start(alice, 'msg_arc_bob', 'Bonjour').expect(201);
    const conversationId = opened.body.conversationId;

    await mutation(bob, conversationId, 'archive', 'put').expect(204);
    await mutation(bob, conversationId, 'archive', 'put').expect(204);

    const hidden = await bob.agent.get(`${MESSAGES}/conversations`).expect(200);
    expect(hidden.body.conversations).toEqual([]);
    const archived = await bob.agent.get(`${MESSAGES}/conversations?archived=true`).expect(200);
    expect(archived.body.conversations).toMatchObject([{ id: conversationId, archived: true, muted: false }]);

    const aliceInbox = await alice.agent.get(`${MESSAGES}/conversations`).expect(200);
    expect(aliceInbox.body.conversations).toMatchObject([{ id: conversationId, archived: false }]);

    await mutation(bob, conversationId, 'archive', 'delete').expect(204);
    await mutation(bob, conversationId, 'archive', 'delete').expect(204);

    const back = await bob.agent.get(`${MESSAGES}/conversations`).expect(200);
    expect(back.body.conversations).toMatchObject([{ id: conversationId, archived: false }]);
    const noneArchived = await bob.agent.get(`${MESSAGES}/conversations?archived=true`).expect(200);
    expect(noneArchived.body.conversations).toEqual([]);
  });

  it('mutes a conversation for the viewer without blocking the messages, and unmutes it', async () => {
    await createAccount(app, 'msg_mut_alice');
    await createAccount(app, 'msg_mut_bob');
    const alice = await userSignedIn(app, 'msg_mut_alice');
    const bob = await userSignedIn(app, 'msg_mut_bob');
    await bob.agent.put(`${BASE}/users/msg_mut_alice/follow`).set('x-csrf-token', bob.csrf).expect(200);
    const opened = await start(alice, 'msg_mut_bob', 'Bonjour').expect(201);
    const conversationId = opened.body.conversationId;

    await mutation(bob, conversationId, 'mute', 'put').expect(204);
    await mutation(bob, conversationId, 'mute', 'put').expect(204);
    await send(alice, conversationId, 'Toujours là').expect(201);

    const muted = await bob.agent.get(`${MESSAGES}/conversations`).expect(200);
    expect(muted.body.conversations).toMatchObject([{ id: conversationId, muted: true, archived: false }]);

    await mutation(bob, conversationId, 'mute', 'delete').expect(204);
    const unmuted = await bob.agent.get(`${MESSAGES}/conversations`).expect(200);
    expect(unmuted.body.conversations).toMatchObject([{ id: conversationId, muted: false }]);
  });

  it('answers 404 to a viewer who takes no part in the conversation, on mute and on archive', async () => {
    await createAccount(app, 'msg_mo_alice');
    await createAccount(app, 'msg_mo_bob');
    await createAccount(app, 'msg_mo_carol');
    const alice = await userSignedIn(app, 'msg_mo_alice');
    const carol = await userSignedIn(app, 'msg_mo_carol');
    const opened = await start(alice, 'msg_mo_bob', 'Bonjour').expect(201);
    const conversationId = opened.body.conversationId;

    await mutation(carol, conversationId, 'mute', 'put').expect(404);
    await mutation(carol, conversationId, 'mute', 'delete').expect(404);
    await mutation(carol, conversationId, 'archive', 'put').expect(404);
    await mutation(carol, conversationId, 'archive', 'delete').expect(404);
  });
});
