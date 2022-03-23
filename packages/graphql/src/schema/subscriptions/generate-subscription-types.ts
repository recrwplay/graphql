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

import { SchemaComposer } from "graphql-compose";
import { SubscriptionsEvent } from "../../subscriptions/subscriptions-event";
import { Node } from "../../classes";
import { EventType } from "../types/enums/EventType";
import { generateSubscriptionWhereType } from "./generate-subscription-where-type";
import { generateEventPayloadType } from "./generate-event-payload-type";
import { subscribe, subscriptionResolve } from "../resolvers/subscriptions/subscribe";

export function generateSubscriptionTypes({
    schemaComposer,
    nodes,
}: {
    schemaComposer: SchemaComposer;
    nodes: Node[];
}) {
    const subscriptionComposer = schemaComposer.Subscription;

    const eventTypeEnum = schemaComposer.createEnumTC(EventType);

    nodes.forEach((node) => {
        const eventPayload = generateEventPayloadType(node, schemaComposer);
        const where = generateSubscriptionWhereType(node, schemaComposer);
        const subscribeOperation = node.rootTypeFieldNames.subscribe;

        const nodeCreatedEvent = schemaComposer.createObjectTC({
            name: `${node.name}CreatedEvent`,
            fields: {
                event: {
                    type: eventTypeEnum.NonNull,
                    resolve: () => EventType.getValue("CREATE"),
                },
                [`created${node.name}`]: {
                    type: eventPayload.NonNull,
                    resolve: (source: SubscriptionsEvent) => source.properties.new,
                },
            },
        });

        const nodeUpdatedEvent = schemaComposer.createObjectTC({
            name: `${node.name}UpdatedEvent`,
            fields: {
                event: {
                    type: eventTypeEnum.NonNull,
                    resolve: () => EventType.getValue("UPDATE"),
                },
                previousState: {
                    type: eventPayload.NonNull,
                    resolve: (source: SubscriptionsEvent) => source.properties.old,
                },
                [`updated${node.name}`]: {
                    type: eventPayload.NonNull,
                    resolve: (source: SubscriptionsEvent) => source.properties.new,
                },
            },
        });

        const nodeDeletedEvent = schemaComposer.createObjectTC({
            name: `${node.name}DeletedEvent`,
            fields: {
                event: {
                    type: eventTypeEnum.NonNull,
                    resolve: () => EventType.getValue("DELETE"),
                },
                [`deleted${node.name}`]: {
                    type: eventPayload.NonNull,
                    resolve: (source: SubscriptionsEvent) => source.properties.old,
                },
            },
        });

        subscriptionComposer.addFields({
            [subscribeOperation.created]: {
                args: { where },
                type: nodeCreatedEvent.NonNull,
                subscribe: subscribe(node, "create"),
                resolve: subscriptionResolve,
            },
            [subscribeOperation.updated]: {
                args: { where },
                type: nodeUpdatedEvent.NonNull,
                subscribe: subscribe(node, "update"),
                resolve: subscriptionResolve,
            },
            [subscribeOperation.deleted]: {
                args: { where },
                type: nodeDeletedEvent.NonNull,
                subscribe: subscribe(node, "delete"),
                resolve: subscriptionResolve,
            },
        });
    });
}
