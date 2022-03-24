/*
 * Copyright (c) "Neo4j"
 * Neo4j Sweden AB [http://neo4j.com]
 *
 * This file is part of Neo4j.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Driver } from "neo4j-driver";
import { Neo4jGraphQL } from "../../src/classes";
import { generateUniqueType } from "../utils/graphql-types";
import { ApolloTestServer, TestGraphQLServer } from "./setup/apollo-server";
import supertest, { Response } from "supertest";
import * as neo4j from "neo4j-driver";
import { TestSubscriptionsPlugin } from "../utils/TestSubscriptionPlugin";
import { WebSocketClient, WebSocketTestClient } from "./setup/ws-client";

describe("Subscriptions", () => {
    let driver: Driver;

    const typeMovie = generateUniqueType("Movie");
    const typeActor = generateUniqueType("Actor");

    let server: TestGraphQLServer;
    let wsClient: WebSocketClient;

    beforeAll(async () => {
        const typeDefs = `
         type ${typeMovie} {
             title: String
         }

         type ${typeActor} {
             name: String
         }
         `;

        driver = neo4j.driver("bolt://localhost:7687", neo4j.auth.basic("neo4j", "dontpanic42"));

        const neoSchema = new Neo4jGraphQL({
            typeDefs: typeDefs,
            driver,
            plugins: {
                subscriptions: new TestSubscriptionsPlugin(),
            } as any,
        });

        server = new ApolloTestServer(neoSchema);
        await server.start();
        wsClient = new WebSocketTestClient(server.wsPath);
    });

    afterAll(async () => {
        await server.close();
        await driver.close();
        await wsClient.close();
    });

    afterEach(async () => {});

    test("simple mutation", async () => {
        // TODO: move to separate e2e
        const result = await createMovie("dsa");

        expect(result.body).toEqual({
            data: { [typeMovie.operations.create]: { [typeMovie.plural]: [{ title: "dsa" }] } },
        });
    });

    test("create subscription", async () => {
        await wsClient.subscribe(`
                            subscription {
                                ${typeMovie.operations.subscribe.created} {
                                    ${typeMovie.operations.subscribe.created} {
                                        title
                                    }
                                }
                            }
                            `);

        await createMovie("movie1");
        await createMovie("movie2");

        expect(wsClient.events).toEqual([
            {
                [typeMovie.operations.subscribe.created]: {
                    [typeMovie.operations.subscribe.created]: { title: "movie1" },
                },
            },
            {
                [typeMovie.operations.subscribe.created]: {
                    [typeMovie.operations.subscribe.created]: { title: "movie2" },
                },
            },
        ]);
    });

    async function createMovie(title: string): Promise<Response> {
        const result = await supertest(server.path)
            .post("")
            .send({
                query: `
                    mutation {
                        ${typeMovie.operations.create}(input: [{ title: "${title}" }]) {
                            ${typeMovie.plural} {
                                title
                            }
                        }
                    }
                `,
            })
            .expect(200);
        return result;
    }
});
