import { Card } from '../../models/card';
import { catalogFromCards } from '../catalog';
import { Catalog } from '../types';
import systemGatewayData from '../data/system_gateway.json';
import './system-gateway';

/** Engine catalog of the System Gateway printings (static file, see scripts/fetch-engine-cards.mjs). */
export const SYSTEM_GATEWAY_CATALOG: Catalog = catalogFromCards(
  systemGatewayData as unknown as Card[],
);
