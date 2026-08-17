import {
  assertBrCareerHubCatalog,
  BR_CAREER_HUBS,
  buildBrFeederCorridors,
} from './career-br-hubs.js';
import {
  assertArCareerHubCatalog,
  AR_CAREER_HUBS,
  buildArFeederCorridors,
} from './career-ar-hubs.js';
import {
  bushLotPayMult,
  isBushFreightOdAllowed,
  isBushHub,
  isBushTripOnlyHub,
} from './career-bush.js';
import { assertBushTripCatalog } from './career-bush-trips.js';
import {
  assertCaCareerHubCatalog,
  buildCaFeederCorridors,
  CA_CAREER_HUBS,
} from './career-ca-hubs.js';
import {
  assertClCareerHubCatalog,
  CAREER_AIRPORT_ICAO_REMAP,
  CL_CAREER_HUBS,
  buildClFeederCorridors,
  rewriteCareerIcaoFields,
} from './career-cl-hubs.js';
import {
  assertUyCareerHubCatalog,
  UY_CAREER_HUBS,
  buildUyFeederCorridors,
} from './career-uy-hubs.js';
import {
  assertPyCareerHubCatalog,
  PY_CAREER_HUBS,
  buildPyFeederCorridors,
} from './career-py-hubs.js';
import {
  assertPeCareerHubCatalog,
  PE_CAREER_HUBS,
  buildPeFeederCorridors,
} from './career-pe-hubs.js';
import {
  assertBoCareerHubCatalog,
  BO_CAREER_HUBS,
  buildBoFeederCorridors,
} from './career-bo-hubs.js';
import {
  assertEcCareerHubCatalog,
  EC_CAREER_HUBS,
  buildEcFeederCorridors,
} from './career-ec-hubs.js';
import {
  assertCoCareerHubCatalog,
  CO_CAREER_HUBS,
  buildCoFeederCorridors,
} from './career-co-hubs.js';
import {
  assertVeCareerHubCatalog,
  VE_CAREER_HUBS,
  buildVeFeederCorridors,
} from './career-ve-hubs.js';
import {
  assertGyCareerHubCatalog,
  GY_CAREER_HUBS,
  buildGyFeederCorridors,
} from './career-gy-hubs.js';
import {
  assertSrCareerHubCatalog,
  SR_CAREER_HUBS,
  buildSrFeederCorridors,
} from './career-sr-hubs.js';
import {
  assertGfCareerHubCatalog,
  GF_CAREER_HUBS,
  buildGfFeederCorridors,
} from './career-gf-hubs.js';
import {
  assertPaCareerHubCatalog,
  PA_CAREER_HUBS,
  buildPaFeederCorridors,
} from './career-pa-hubs.js';
import {
  assertCrCareerHubCatalog,
  CR_CAREER_HUBS,
  buildCrFeederCorridors,
} from './career-cr-hubs.js';
import {
  assertNiCareerHubCatalog,
  NI_CAREER_HUBS,
  buildNiFeederCorridors,
} from './career-ni-hubs.js';
import {
  assertHnCareerHubCatalog,
  HN_CAREER_HUBS,
  buildHnFeederCorridors,
} from './career-hn-hubs.js';
import {
  assertSvCareerHubCatalog,
  SV_CAREER_HUBS,
  buildSvFeederCorridors,
} from './career-sv-hubs.js';
import {
  assertGtCareerHubCatalog,
  GT_CAREER_HUBS,
  buildGtFeederCorridors,
} from './career-gt-hubs.js';
import {
  assertBzCareerHubCatalog,
  BZ_CAREER_HUBS,
  buildBzFeederCorridors,
} from './career-bz-hubs.js';
import {
  assertCuCareerHubCatalog,
  CU_CAREER_HUBS,
  buildCuFeederCorridors,
} from './career-cu-hubs.js';
import {
  assertDoCareerHubCatalog,
  DO_CAREER_HUBS,
  buildDoFeederCorridors,
} from './career-do-hubs.js';
import {
  assertHtCareerHubCatalog,
  HT_CAREER_HUBS,
  buildHtFeederCorridors,
} from './career-ht-hubs.js';
import {
  assertJmCareerHubCatalog,
  JM_CAREER_HUBS,
  buildJmFeederCorridors,
} from './career-jm-hubs.js';
import {
  assertBsCareerHubCatalog,
  BS_CAREER_HUBS,
  buildBsFeederCorridors,
} from './career-bs-hubs.js';
import {
  assertTtCareerHubCatalog,
  TT_CAREER_HUBS,
  buildTtFeederCorridors,
} from './career-tt-hubs.js';
import {
  assertBbCareerHubCatalog,
  BB_CAREER_HUBS,
  buildBbFeederCorridors,
} from './career-bb-hubs.js';
import {
  assertLcCareerHubCatalog,
  LC_CAREER_HUBS,
  buildLcFeederCorridors,
} from './career-lc-hubs.js';
import {
  assertGdCareerHubCatalog,
  GD_CAREER_HUBS,
  buildGdFeederCorridors,
} from './career-gd-hubs.js';
import {
  assertAgCareerHubCatalog,
  AG_CAREER_HUBS,
  buildAgFeederCorridors,
} from './career-ag-hubs.js';
import {
  assertGpCareerHubCatalog,
  GP_CAREER_HUBS,
  buildGpFeederCorridors,
} from './career-gp-hubs.js';
import {
  assertMqCareerHubCatalog,
  MQ_CAREER_HUBS,
  buildMqFeederCorridors,
} from './career-mq-hubs.js';
import {
  assertCwCareerHubCatalog,
  CW_CAREER_HUBS,
  buildCwFeederCorridors,
} from './career-cw-hubs.js';
import {
  assertSxCareerHubCatalog,
  SX_CAREER_HUBS,
  buildSxFeederCorridors,
} from './career-sx-hubs.js';
import {
  assertAwCareerHubCatalog,
  AW_CAREER_HUBS,
  buildAwFeederCorridors,
} from './career-aw-hubs.js';
import {
  assertPtCareerHubCatalog,
  PT_CAREER_HUBS,
  buildPtFeederCorridors,
} from './career-pt-hubs.js';
import {
  assertEsCareerHubCatalog,
  ES_CAREER_HUBS,
  buildEsFeederCorridors,
} from './career-es-hubs.js';
import {
  assertFrCareerHubCatalog,
  FR_CAREER_HUBS,
  buildFrFeederCorridors,
} from './career-fr-hubs.js';
import {
  assertGbCareerHubCatalog,
  GB_CAREER_HUBS,
  buildGbFeederCorridors,
} from './career-gb-hubs.js';
import {
  assertDeCareerHubCatalog,
  DE_CAREER_HUBS,
  buildDeFeederCorridors,
} from './career-de-hubs.js';
import {
  assertNlCareerHubCatalog,
  NL_CAREER_HUBS,
  buildNlFeederCorridors,
} from './career-nl-hubs.js';
import {
  assertBeCareerHubCatalog,
  BE_CAREER_HUBS,
  buildBeFeederCorridors,
} from './career-be-hubs.js';
import {
  assertItCareerHubCatalog,
  IT_CAREER_HUBS,
  buildItFeederCorridors,
} from './career-it-hubs.js';
import {
  assertIeCareerHubCatalog,
  IE_CAREER_HUBS,
  buildIeFeederCorridors,
} from './career-ie-hubs.js';
import {
  assertDkCareerHubCatalog,
  DK_CAREER_HUBS,
  buildDkFeederCorridors,
} from './career-dk-hubs.js';
import {
  assertNoCareerHubCatalog,
  NO_CAREER_HUBS,
  buildNoFeederCorridors,
} from './career-no-hubs.js';
import {
  assertSeCareerHubCatalog,
  SE_CAREER_HUBS,
  buildSeFeederCorridors,
} from './career-se-hubs.js';
import {
  assertFiCareerHubCatalog,
  FI_CAREER_HUBS,
  buildFiFeederCorridors,
} from './career-fi-hubs.js';
import {
  assertChCareerHubCatalog,
  CH_CAREER_HUBS,
  buildChFeederCorridors,
} from './career-ch-hubs.js';
import {
  assertAtCareerHubCatalog,
  AT_CAREER_HUBS,
  buildAtFeederCorridors,
} from './career-at-hubs.js';
import {
  assertPlCareerHubCatalog,
  PL_CAREER_HUBS,
  buildPlFeederCorridors,
} from './career-pl-hubs.js';
import {
  assertCzCareerHubCatalog,
  CZ_CAREER_HUBS,
  buildCzFeederCorridors,
} from './career-cz-hubs.js';
import {
  assertSkCareerHubCatalog,
  SK_CAREER_HUBS,
  buildSkFeederCorridors,
} from './career-sk-hubs.js';
import {
  assertHuCareerHubCatalog,
  HU_CAREER_HUBS,
  buildHuFeederCorridors,
} from './career-hu-hubs.js';
import {
  assertEeCareerHubCatalog,
  EE_CAREER_HUBS,
  buildEeFeederCorridors,
} from './career-ee-hubs.js';
import {
  assertLvCareerHubCatalog,
  LV_CAREER_HUBS,
  buildLvFeederCorridors,
} from './career-lv-hubs.js';
import {
  assertLtCareerHubCatalog,
  LT_CAREER_HUBS,
  buildLtFeederCorridors,
} from './career-lt-hubs.js';
import {
  assertHrCareerHubCatalog,
  HR_CAREER_HUBS,
  buildHrFeederCorridors,
} from './career-hr-hubs.js';
import {
  assertSiCareerHubCatalog,
  SI_CAREER_HUBS,
  buildSiFeederCorridors,
} from './career-si-hubs.js';
import {
  assertRoCareerHubCatalog,
  RO_CAREER_HUBS,
  buildRoFeederCorridors,
} from './career-ro-hubs.js';
import {
  assertBgCareerHubCatalog,
  BG_CAREER_HUBS,
  buildBgFeederCorridors,
} from './career-bg-hubs.js';
import {
  assertGrCareerHubCatalog,
  GR_CAREER_HUBS,
  buildGrFeederCorridors,
} from './career-gr-hubs.js';
import {
  assertRsCareerHubCatalog,
  RS_CAREER_HUBS,
  buildRsFeederCorridors,
} from './career-rs-hubs.js';
import {
  assertIsCareerHubCatalog,
  IS_CAREER_HUBS,
  buildIsFeederCorridors,
} from './career-is-hubs.js';
import {
  assertBaCareerHubCatalog,
  BA_CAREER_HUBS,
  buildBaFeederCorridors,
} from './career-ba-hubs.js';
import {
  assertMeCareerHubCatalog,
  ME_CAREER_HUBS,
  buildMeFeederCorridors,
} from './career-me-hubs.js';
import {
  assertAlCareerHubCatalog,
  AL_CAREER_HUBS,
  buildAlFeederCorridors,
} from './career-al-hubs.js';
import {
  assertMkCareerHubCatalog,
  MK_CAREER_HUBS,
  buildMkFeederCorridors,
} from './career-mk-hubs.js';
import {
  assertTrCareerHubCatalog,
  TR_CAREER_HUBS,
  buildTrFeederCorridors,
} from './career-tr-hubs.js';
import {
  assertUaCareerHubCatalog,
  UA_CAREER_HUBS,
  buildUaFeederCorridors,
} from './career-ua-hubs.js';
import {
  assertByCareerHubCatalog,
  BY_CAREER_HUBS,
  buildByFeederCorridors,
} from './career-by-hubs.js';
import {
  assertMdCareerHubCatalog,
  MD_CAREER_HUBS,
  buildMdFeederCorridors,
} from './career-md-hubs.js';
import {
  assertGeCareerHubCatalog,
  GE_CAREER_HUBS,
  buildGeFeederCorridors,
} from './career-ge-hubs.js';
import {
  assertAmCareerHubCatalog,
  AM_CAREER_HUBS,
  buildAmFeederCorridors,
} from './career-am-hubs.js';
import {
  assertAzCareerHubCatalog,
  AZ_CAREER_HUBS,
  buildAzFeederCorridors,
} from './career-az-hubs.js';
import {
  assertLuCareerHubCatalog,
  LU_CAREER_HUBS,
  buildLuFeederCorridors,
} from './career-lu-hubs.js';
import {
  assertMtCareerHubCatalog,
  MT_CAREER_HUBS,
  buildMtFeederCorridors,
} from './career-mt-hubs.js';
import {
  assertCyCareerHubCatalog,
  CY_CAREER_HUBS,
  buildCyFeederCorridors,
} from './career-cy-hubs.js';
import {
  assertXkCareerHubCatalog,
  XK_CAREER_HUBS,
  buildXkFeederCorridors,
} from './career-xk-hubs.js';
import {
  assertMaCareerHubCatalog,
  MA_CAREER_HUBS,
  buildMaFeederCorridors,
} from './career-ma-hubs.js';
import {
  assertDzCareerHubCatalog,
  DZ_CAREER_HUBS,
  buildDzFeederCorridors,
} from './career-dz-hubs.js';
import {
  assertTnCareerHubCatalog,
  TN_CAREER_HUBS,
  buildTnFeederCorridors,
} from './career-tn-hubs.js';
import {
  assertEgCareerHubCatalog,
  EG_CAREER_HUBS,
  buildEgFeederCorridors,
} from './career-eg-hubs.js';
import {
  assertIlCareerHubCatalog,
  IL_CAREER_HUBS,
  buildIlFeederCorridors,
} from './career-il-hubs.js';
import {
  assertSaCareerHubCatalog,
  SA_CAREER_HUBS,
  buildSaFeederCorridors,
} from './career-sa-hubs.js';
import {
  assertAeCareerHubCatalog,
  AE_CAREER_HUBS,
  buildAeFeederCorridors,
} from './career-ae-hubs.js';
import {
  assertQaCareerHubCatalog,
  QA_CAREER_HUBS,
  buildQaFeederCorridors,
} from './career-qa-hubs.js';
import {
  assertBhCareerHubCatalog,
  BH_CAREER_HUBS,
  buildBhFeederCorridors,
} from './career-bh-hubs.js';
import {
  assertKwCareerHubCatalog,
  KW_CAREER_HUBS,
  buildKwFeederCorridors,
} from './career-kw-hubs.js';
import {
  assertOmCareerHubCatalog,
  OM_CAREER_HUBS,
  buildOmFeederCorridors,
} from './career-om-hubs.js';
import {
  assertIqCareerHubCatalog,
  IQ_CAREER_HUBS,
  buildIqFeederCorridors,
} from './career-iq-hubs.js';
import {
  assertIrCareerHubCatalog,
  IR_CAREER_HUBS,
  buildIrFeederCorridors,
} from './career-ir-hubs.js';
import {
  assertJoCareerHubCatalog,
  JO_CAREER_HUBS,
  buildJoFeederCorridors,
} from './career-jo-hubs.js';
import {
  assertLbCareerHubCatalog,
  LB_CAREER_HUBS,
  buildLbFeederCorridors,
} from './career-lb-hubs.js';
import {
  assertSyCareerHubCatalog,
  SY_CAREER_HUBS,
  buildSyFeederCorridors,
} from './career-sy-hubs.js';
import {
  assertLyCareerHubCatalog,
  LY_CAREER_HUBS,
  buildLyFeederCorridors,
} from './career-ly-hubs.js';
import {
  assertSdCareerHubCatalog,
  SD_CAREER_HUBS,
  buildSdFeederCorridors,
} from './career-sd-hubs.js';
import {
  assertYeCareerHubCatalog,
  YE_CAREER_HUBS,
  buildYeFeederCorridors,
} from './career-ye-hubs.js';
import {
  assertPkCareerHubCatalog,
  PK_CAREER_HUBS,
  buildPkFeederCorridors,
} from './career-pk-hubs.js';
import {
  assertInCareerHubCatalog,
  IN_CAREER_HUBS,
  buildInFeederCorridors,
} from './career-in-hubs.js';
import {
  assertLkCareerHubCatalog,
  LK_CAREER_HUBS,
  buildLkFeederCorridors,
} from './career-lk-hubs.js';
import {
  assertKzCareerHubCatalog,
  KZ_CAREER_HUBS,
  buildKzFeederCorridors,
} from './career-kz-hubs.js';
import {
  assertUzCareerHubCatalog,
  UZ_CAREER_HUBS,
  buildUzFeederCorridors,
} from './career-uz-hubs.js';
import {
  assertTmCareerHubCatalog,
  TM_CAREER_HUBS,
  buildTmFeederCorridors,
} from './career-tm-hubs.js';
import {
  assertTjCareerHubCatalog,
  TJ_CAREER_HUBS,
  buildTjFeederCorridors,
} from './career-tj-hubs.js';
import {
  assertKgCareerHubCatalog,
  KG_CAREER_HUBS,
  buildKgFeederCorridors,
} from './career-kg-hubs.js';
import {
  assertAfCareerHubCatalog,
  AF_CAREER_HUBS,
  buildAfFeederCorridors,
} from './career-af-hubs.js';
import {
  assertNpCareerHubCatalog,
  NP_CAREER_HUBS,
  buildNpFeederCorridors,
} from './career-np-hubs.js';
import {
  assertBdCareerHubCatalog,
  BD_CAREER_HUBS,
  buildBdFeederCorridors,
} from './career-bd-hubs.js';
import {
  assertBtCareerHubCatalog,
  BT_CAREER_HUBS,
  buildBtFeederCorridors,
} from './career-bt-hubs.js';
import {
  assertMmCareerHubCatalog,
  MM_CAREER_HUBS,
  buildMmFeederCorridors,
} from './career-mm-hubs.js';
import { assertUsPrCareerHubCatalog } from './career-us-pr-hubs.js';
import { assertUsViCareerHubCatalog } from './career-us-vi-hubs.js';
import { assertDispatchHubsAreSimBriefKnown } from './career-simbrief-airports.js';
import {
  assertMxCareerHubCatalog,
  buildMxFeederCorridors,
  MX_CAREER_HUBS,
} from './career-mx-hubs.js';
import {
  assertUsCareerHubCatalog,
  buildUsFeederCorridors,
  US_CAREER_HUBS,
} from './career-us-hubs.js';
import {
  applyMsfsBushHubOverrideToTerminal,
  lookupMsfsBushHubOverride,
} from './career-msfs-hub-overrides.js';
import {
  ensureWorldHubLevels,
  hubLevelHealthMult,
  hubLevelLaneBonus,
  hubLevelOriginPayMult,
  recordFreightSettleActivity,
  recordLotFormationActivity,
  tickHubLevels,
} from './career-hub-level.js';
import {
  ensureFuelTruckFleet,
  seedFuelTruckFleet,
  settleFuelHaulsDue,
  shiftFuelLogisticsWallClock,
  tickFuelLogistics,
} from './career-fuel-logistics.js';
import {
  ensureNpcFleet,
  listNpcActivity,
  listNpcHomeRegions,
  npcClaimForLot,
  laneInboundKg,
  npcLaneSaturation,
  npcRegionBidCapacity,
  partitionLiftableKgPerDay,
  describeLotMarketPressure,
  seedNpcFleet,
  settleNpcOpsDue,
  tickNpcFreighters,
  ensureLaneInboundIndex,
  LANE_BUSY_SATURATION,
  LANE_BUSY_PAY_SLOPE,
  THIN_FLEET_PAY_SLOPE,
} from './career-npc.js';
import {
  regionalWeatherIndex,
  regionalWeatherLifeMult,
  regionalWeatherPayMult,
  worseWeather,
} from './career-weather.js';
import {
  hoursToMs,
  MAX_CATCH_UP_TICKS,
  MS_PER_TICK,
  TICKS_PER_DAY,
} from './career-clock.js';
import { boardDisplayPayUsd } from './market-board-query.js';
import {
  noteDeliveryStock,
  noteLotDelivered,
  noteLotExpired,
  noteLotFormed,
  noteLotRecycled,
  noteReserveRefund,
  noteWarehouseFlow,
} from './career-economy-flow.js';
import {
  countryIdFromRegion,
  ensureHomeCountryId,
  isDomesticOd,
  listWorldCountryIds,
} from './career-partition.js';
import type {
  AirportTerminal,
  CareerEconomyWorld,
  CareerEconomyWorldV1,
  CommodityDef,
  CommodityId,
  EconomyEvent,
  EconomyEventKind,
  FlowLotSizeBand,
  FuelHaul,
  FuelTruck,
  HubTier,
  InternationalLane,
  MarketLotView,
  NpcActivityView,
  NpcFlight,
  NpcFreighter,
  PartitionTickResult,
  ShipmentLot,
  StockPile,
} from './types/career-economy.js';

export type {
  AirportTerminal,
  CareerEconomyWorld,
  CareerEconomyWorldV1,
  CareerEconomyWorldV2,
  CommodityDef,
  CommodityId,
  EconomyEvent,
  EconomyEventKind,
  FuelHaul,
  FuelHaulView,
  FuelTruck,
  FuelTruckClassId,
  HubTier,
  InboundPending,
  InternationalLane,
  MarketLotView,
  NpcActivityView,
  NpcFleetMemberView,
  NpcFlight,
  NpcFreighter,
  PartitionTickResult,
  ShipmentLot,
  StockPile,
} from './types/career-economy.js';

export {
  activeLaneKg,
  countryIdFromRegion,
  ensureHomeCountryId,
  findInternationalLane,
  inferHomeCountryId,
  isDomesticOd,
  isInternationalOdAllowed,
  laneMatchesOd,
  listWorldCountryIds,
} from './career-partition.js';

export {
  clampHubLevel,
  ensureAirportHubLevel,
  ensureWorldHubLevels,
  HUB_ACTIVITY,
  HUB_LEVEL_CURVE_VERSION,
  HUB_LEVEL_MAX,
  HUB_LEVEL_MIN,
  HUB_LEVEL_PROFILE,
  HUB_LEVEL_XP_PER_TICK_CAP,
  HUB_LEVEL_XP_TO_REACH,
  hubLevelFromXp,
  hubLevelHealthMult,
  hubLevelLaneBonus,
  hubLevelNpcBidMult,
  hubLevelOriginPayMult,
  hubLevelProfile,
  hubLevelXpProgress,
  recordFreightSettleActivity,
  recordFuelTruckDeliveryActivity,
  recordFuelUpliftActivity,
  recordHubActivity,
  recordLotFormationActivity,
  regionAverageHubLevel,
  tickHubLevels,
} from './career-hub-level.js';

export {
  countFuelHaulsEnroute,
  ensureFuelTruckFleet,
  estimateFuelHaulHours,
  FUEL_TRUCK_CAPACITY_KG,
  FUEL_TRUCK_COMPOSITION,
  FUEL_TRUCK_FLEET_SIZE,
  FUEL_TRUCK_LABEL,
  getFuelTruckCapacityKg,
  listAirportFuelInbound,
  listFuelHaulViews,
  regionFuelThin,
  seedFuelTruckFleet,
  settleFuelHaulsDue,
  tickFuelLogistics,
} from './career-fuel-logistics.js';

export {
  createNpcContractPilotOffer,
  createNpcRepositionOffer,
  acceptContractPilotOffer,
  contractPilotLiftKg,
  listContractPilotPickAirframes,
  contractPilotFeeRangeUsd,
  contractPilotHasFlyableAirframe,
  describeLotMarketPressure,
  drainNpcMroParts,
  ensureNpcAirframes,
  ensureNpcFleet,
  ensureNpcRegionCoverage,
  estimateNpcBlockHours,
  contractPilotMissionDeadlineTick,
  findNpcAirframe,
  isNpcRepositionFlight,
  listHomologatedNpcAirframesForClass,
  listNpcAirframesForClass,
  listNpcActivity,
  listNpcFleetStatus,
  listRegionMarketPressure,
  npcAirframeIsHomologated,
  npcAirframeLabel,
  npcCanOfferContractPilot,
  npcClaimForLot,
  npcLaneAirborneKg,
  npcMaxCargoKg,
  pickNpcHomeReturnIcao,
  playerLaneInboundKg,
  laneInboundKg,
  npcLaneSaturation,
  npcRegionBidCapacity,
  isNpcReadyToBid,
  NPC_MIN_BID_KG,
  scoreLotForNpc,
  CONTRACT_PILOT_FEE_FRAC,
  CONTRACT_PILOT_OFFER_CHANCE,
  AWAITING_PILOT_MIN_HOURS,
  AWAITING_PILOT_MAX_HOURS,
  REPOSITION_AWAITING_MIN_HOURS,
  REPOSITION_AWAITING_MAX_HOURS,
  MAX_OPEN_REPOSITION_OFFERS,
  MAX_OPEN_STARTER_REPOSITION_OFFERS,
  MIN_OPEN_CONTRACT_PILOT_OFFERS,
  MIN_OPEN_STARTER_CONTRACT_PILOT_OFFERS,
  MAX_OPEN_CONTRACT_PILOT_OFFERS_PER_REGION,
  STARTER_CONTRACT_PILOT_CLASSES,
  STARTER_CONTRACT_PILOT_OFFERS_PER_REGION,
  isStarterContractPilotClass,
  countOpenContractPilotOffers,
  maxOpenContractPilotOffers,
  partitionLiftableKgPerDay,
  NPC_LEGS_PER_DAY_EST,
  REPOSITION_PILOT_FEE_MIN_USD,
  quoteContractPilotFeeUsd,
  quoteRepositionPilotFeeUsd,
  NPC_AIRFRAME_VARIANTS,
  NPC_FLEET_COMPOSITION,
  NPC_FLEET_SIZE,
  NPCS_PER_REGION,
  NPC_FLEET_MIN,
  NPC_FLEET_CLASS_SHARES,
  listNpcHomeRegions,
  resolveNpcFleetComposition,
  targetNpcFleetSize,
  pruneNpcFleetComposition,
  rebalanceNpcHomeRegions,
  topUpNpcFleetComposition,
  NPC_MX_INTERVAL_HOURS,
  NPC_MX_PARTS_KG,
  NPC_MX_SHOP_HOURS,
  LANE_BUSY_SATURATION,
  LANE_BUSY_PAY_SLOPE,
  LANE_SATURATION_KG,
  THIN_FLEET_CAPACITY,
  THIN_FLEET_PAY_SLOPE,
  pickNpcAirframe,
  seedNpcFleet,
  settleNpcOpsDue,
  tickNpcFreighters,
} from './career-npc.js';

export type {
  LotMarketPressure,
  NpcAirframeVariant,
  NpcFleetCompositionSlot,
  RegionMarketPressure,
} from './career-npc.js';

export {
  economyDayIndex,
  listRegionalWeather,
  regionalWeatherBidMult,
  regionalWeatherIndex,
  regionalWeatherLifeMult,
  regionalWeatherPayMult,
  worseWeather,
} from './career-weather.js';

export type { RegionalWeather, RegionWeatherView } from './career-weather.js';

export {
  hoursToMs,
  hoursToTicks,
  MAX_CATCH_UP_TICKS,
  msToHours,
  MS_PER_HOUR,
  MS_PER_TICK,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
} from './career-clock.js';

/** Max concurrent active lots on the same commodity+route (large + small). Fallback for major↔major. */
export const MAX_LOTS_PER_LANE = 5;
/** Soft caps within a lane so light aircraft see bookable slices. Fallback for major↔major. */
export const MAX_LARGE_LOTS_PER_LANE = 3;
export const MAX_SMALL_LOTS_PER_LANE = 2;

/**
 * Share of a lot's mass soft-committed out of origin stock at formation.
 * The rest is drawn on delivery; the reserve is returned if the lot expires.
 * Together these keep freight mass conserved instead of leaking on every lot.
 */
export const LOT_FORMATION_RESERVE_FRACTION = 0.25;

/** True LTL floor — Bonanza-class (maxCargo 450 kg) can bid. */
export const SMALL_LOT_MIN_KG = 80;
/** Caravan / light-jet LTL ceiling. */
export const SMALL_LOT_MAX_KG = 2_000;
/** GA-sized LTL band (spoke feeders). */
export const GA_LTL_MAX_KG = 450;
/** Light GA max range — GA-sized lots beyond this die without lift. */
export const GA_LTL_MAX_NM = 800;
/** Light turboprop max range — LTL/small lots beyond this are unliftable. */
export const SMALL_LOT_MAX_NM = 900;
/**
 * Starter Cargo Ops only unlocks general/supplies. Majors are net Dry sinks
 * after warehouse calibration, so the bulk surplus→shortage pass never
 * originates Dry from GRU/JFK/etc. Last-mile break-bulk still ships a few
 * GA lots from those hubs to nearby spokes — the metro consumes Dry AND
 * redistributes it, which is the first contract a new pilot can actually fly.
 */
export const LAST_MILE_DRY_IDS: ReadonlySet<CommodityId> = new Set([
  'general',
  'supplies',
]);
const LAST_MILE_ORIGIN_TIERS: ReadonlySet<HubTier> = new Set([
  'major',
  'regional',
  'spoke',
]);
/** Comfortable light-GA hop (C172/Bonanza with payload). */
export const LAST_MILE_MAX_NM = 600;
const LAST_MILE_MIN_NM = 40;
/** Open GA Dry lots kept on the board per origin×commodity. */
export const LAST_MILE_OPEN_LOTS_PER_ORIGIN = 3;
const LAST_MILE_MIN_ORIGIN_FILL = 0.05;
const LAST_MILE_MAX_DEST_FILL = 0.62;
const LAST_MILE_MAX_FORM_PER_TICK = 1;
/** Classic feeder LTL band min (turboprop fills). */
export const FEEDER_LTL_MIN_KG = 400;

/**
 * Soft board depth. Caps are per partition (country / INTL), not a global
 * bucket — a global cap starved US + international after AR/CL (pulse 30d).
 */
export const BOARD_AVAILABLE_SOFT_CAP = 8_500;
export const COMMODITY_AVAILABLE_SOFT_CAP = 1_550;
/** Share of each commodity cap reserved for curated international lanes. */
export const INTL_AVAILABLE_SHARE = 0.12;
/** Floor so a small country (CL) still turns over when the board is deep. */
export const COUNTRY_AVAILABLE_FLOOR = 50;
/**
 * Extra brake on large (≥4 t) electronics/machinery that NPCs were not clearing.
 * Applied per partition (same share as the available quota).
 */
export const COMMODITY_LARGE_AVAILABLE_SOFT_CAP: Partial<
  Record<CommodityId, number>
> = {
  electronics: 1_100,
  machinery: 1_100,
};
/** Idle life progress at which an unclaimed large lot can be recycled. */
export const STALE_LARGE_RECYCLE_PROGRESS = 0.4;
/** Max stale large lots recycled per commodity per formation pass. */
export const STALE_LARGE_RECYCLE_MAX_PER_COMMODITY = 4;
/**
 * Unclaimed GA-LTL / LTL recycle after idle-pay has had time to work
 * (past IDLE_LOT_URGENT_PROGRESS). Earlier than expiry so they do not
 * count as cemetery; later than large so the living signal still shows.
 */
export const STALE_SMALL_RECYCLE_PROGRESS = 0.62;
/** Thin small shelf waits until this life. */
export const STALE_SMALL_RECYCLE_THIN_PROGRESS = 0.82;
/** Last-mile Dry is the starter board — recycle later than feeder LTL. */
export const STALE_LAST_MILE_RECYCLE_PROGRESS = 0.78;
export const STALE_LAST_MILE_RECYCLE_THIN_PROGRESS = 0.9;
/** Max stale small lots recycled per commodity per formation pass. */
export const STALE_SMALL_RECYCLE_MAX_PER_COMMODITY = 8;

/** Large (Narrow-oriented) freight hard cap — unchanged when XL exists. */
export const LARGE_LOT_MAX_KG = 28_000;
/** Wide fill band: rare major↔major (or strong intl) contracts. */
export const XL_LOT_MIN_KG = 40_000;
export const XL_LOT_MAX_KG = 90_000;
/** Domestic corridor weight required for XL (strong trunks only). */
export const XL_CORRIDOR_MIN_WEIGHT = 1.8;
/** Intl lanes need at least this daily OD cap to host an XL lot. */
export const XL_INTL_MIN_CAPACITY_KG_PER_DAY = 70_000;
/** XL pay/kg vs otherwise-identical large formation (~tonnage without jackpot). */
export const XL_LOT_PAY_MULT = 0.88;

/**
 * Static cargo-role profile per hub tier.
 * Calibrated offline from BR cargo roles (~2024): GRU/VCP dominate tonnage;
 * GIG remains a national gateway; regionals mid-network; spokes are LTL/feeders.
 */
export const HUB_TIER_PROFILE: Record<
  HubTier,
  {
    capacityMult: number;
    flowMult: number;
    maxLots: number;
    maxLarge: number;
    maxSmall: number;
    /** Wide-only band; 1 only on major (lane uses min of OD). */
    maxXl: number;
  }
> = {
  major: {
    capacityMult: 2.6,
    flowMult: 2.2,
    maxLots: 5,
    maxLarge: 3,
    maxSmall: 2,
    maxXl: 1,
  },
  regional: {
    capacityMult: 1.0,
    flowMult: 1.0,
    maxLots: 3,
    maxLarge: 2,
    maxSmall: 1,
    maxXl: 0,
  },
  spoke: {
    capacityMult: 0.45,
    flowMult: 0.55,
    maxLots: 2,
    maxLarge: 1,
    maxSmall: 2,
    maxXl: 0,
  },
};

/** Curated ICAO → tier map (all career country catalogs). */
export const HUB_TIER_BY_ICAO: Readonly<Record<string, HubTier>> = {
  ...Object.fromEntries(BR_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(US_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(CA_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(MX_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(AR_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(CL_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(UY_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(PY_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(PE_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(BO_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(EC_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(CO_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(VE_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(GY_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(SR_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(GF_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(PA_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(CR_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(NI_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(HN_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(SV_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(GT_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(BZ_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(CU_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(DO_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(HT_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(JM_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(BS_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(TT_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(BB_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(LC_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(GD_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(AG_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(GP_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(MQ_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(CW_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(SX_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(AW_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(PT_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(ES_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(FR_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(GB_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(DE_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(NL_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(BE_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(IT_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(IE_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(DK_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(NO_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(SE_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(FI_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(CH_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(AT_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(PL_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(CZ_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(SK_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(HU_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(EE_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(LV_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(LT_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(HR_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(SI_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(RO_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(BG_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(GR_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(RS_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(IS_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(BA_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(ME_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(AL_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(MK_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(TR_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(UA_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(BY_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(MD_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(GE_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(AM_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(AZ_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(LU_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(MT_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(CY_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(XK_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(MA_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(DZ_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(TN_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(EG_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(IL_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(SA_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(AE_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(QA_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(BH_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(KW_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(OM_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(IQ_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(IR_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(JO_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(LB_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(SY_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(LY_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(SD_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(YE_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(PK_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(IN_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(LK_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(KZ_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(UZ_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(TM_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(TJ_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(KG_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(AF_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(NP_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(BD_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(BT_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(MM_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
};

export function hubTierOf(airport: Pick<AirportTerminal, 'icao' | 'hubTier'>): HubTier {
  if (airport.hubTier === 'major' || airport.hubTier === 'regional' || airport.hubTier === 'spoke') {
    return airport.hubTier;
  }
  return HUB_TIER_BY_ICAO[airport.icao.toUpperCase()] ?? 'spoke';
}

export function laneLotCaps(
  originTier: HubTier,
  destTier: HubTier,
  opts: { originLevel?: number; destLevel?: number } = {},
): {
  maxLots: number;
  maxLarge: number;
  maxSmall: number;
  maxXl: number;
} {
  const origin = HUB_TIER_PROFILE[originTier];
  const dest = HUB_TIER_PROFILE[destTier];
  const bonus = hubLevelLaneBonus(opts.originLevel ?? 1, opts.destLevel ?? 1);
  return {
    maxLots: Math.min(origin.maxLots, dest.maxLots) + bonus,
    maxLarge: Math.min(origin.maxLarge, dest.maxLarge) + Math.min(1, bonus),
    maxSmall: Math.min(origin.maxSmall, dest.maxSmall) + Math.max(0, bonus - 1),
    // No hub-level XL bonus — keep Wide fills rare.
    maxXl: Math.min(origin.maxXl, dest.maxXl),
  };
}

/** True when an OD may form an XL (Wide) lot under corridor / intl gates. */
export function xlLotOdEligible(
  originTier: HubTier,
  destTier: HubTier,
  corridorW: number,
  opts: { international?: boolean; capacityKgPerDay?: number } = {},
): boolean {
  if (originTier !== 'major' || destTier !== 'major') return false;
  if (opts.international === true) {
    const cap = opts.capacityKgPerDay ?? 0;
    return (
      corridorW >= XL_CORRIDOR_MIN_WEIGHT ||
      cap >= XL_INTL_MIN_CAPACITY_KG_PER_DAY
    );
  }
  return corridorW >= XL_CORRIDOR_MIN_WEIGHT;
}

/**
 * Curated domestic cargo corridors (bidirectional) + auto BR/US/CA/MX feeders.
 * Weights > 1 favor formation + a mild pay bump.
 */
const CAREER_CARGO_CORRIDORS_MANUAL: ReadonlyArray<{
  a: string;
  b: string;
  weight: number;
}> = [
  // SE trunk
  { a: 'SBGR', b: 'SBGL', weight: 2.2 },
  { a: 'SBGR', b: 'SBKP', weight: 1.8 },
  { a: 'SBKP', b: 'SBGL', weight: 1.6 },
  { a: 'SBGR', b: 'SBCF', weight: 1.7 },
  { a: 'SBKP', b: 'SBCF', weight: 1.5 },
  // Historic domestic cargo: SE ↔ Manaus
  { a: 'SBGR', b: 'SBEG', weight: 2.4 },
  { a: 'SBKP', b: 'SBEG', weight: 2.0 },
  { a: 'SBGL', b: 'SBEG', weight: 1.7 },
  // Brasília redistributor
  { a: 'SBGR', b: 'SBBR', weight: 1.9 },
  { a: 'SBKP', b: 'SBBR', weight: 1.7 },
  { a: 'SBGL', b: 'SBBR', weight: 1.5 },
  { a: 'SBBR', b: 'SBEG', weight: 1.6 },
  { a: 'SBBR', b: 'SBRF', weight: 1.5 },
  { a: 'SBBR', b: 'SBPA', weight: 1.4 },
  { a: 'SBBR', b: 'SBGO', weight: 1.7 },
  { a: 'SBBR', b: 'SBCY', weight: 1.4 },
  { a: 'SBBR', b: 'SBCG', weight: 1.3 },
  // SE → South
  { a: 'SBGR', b: 'SBPA', weight: 2.0 },
  { a: 'SBGR', b: 'SBCT', weight: 1.8 },
  { a: 'SBKP', b: 'SBPA', weight: 1.7 },
  { a: 'SBKP', b: 'SBCT', weight: 1.6 },
  { a: 'SBGL', b: 'SBPA', weight: 1.4 },
  // SE → NE
  { a: 'SBGR', b: 'SBRF', weight: 2.1 },
  { a: 'SBGR', b: 'SBFZ', weight: 1.9 },
  { a: 'SBGR', b: 'SBSV', weight: 1.8 },
  { a: 'SBKP', b: 'SBRF', weight: 1.7 },
  { a: 'SBKP', b: 'SBFZ', weight: 1.5 },
  { a: 'SBGL', b: 'SBRF', weight: 1.5 },
  // North internal + Belém links
  { a: 'SBEG', b: 'SBBE', weight: 1.6 },
  { a: 'SBEG', b: 'SBPV', weight: 1.4 },
  { a: 'SBEG', b: 'SBMQ', weight: 1.3 },
  // Amazon bush soft-fields ↔ BR gateways only (formation + mild pay)
  { a: 'SNYA', b: 'SBEG', weight: 2.2 },
  { a: 'SNYA', b: 'SBSN', weight: 2.4 },
  { a: 'SNYA', b: 'SBBE', weight: 2.0 },
  { a: 'SWTP', b: 'SBEG', weight: 2.4 },
  { a: 'SWTP', b: 'SBSN', weight: 1.7 },
  { a: 'SWTP', b: 'SBBE', weight: 1.6 },
  // US bush soft-fields ↔ US gateways
  { a: 'KESW', b: 'KSEA', weight: 2.4 },
  { a: 'KESW', b: 'KPDX', weight: 1.8 },
  { a: 'KESW', b: 'KBOI', weight: 1.6 },
  { a: 'KTCS', b: 'KABQ', weight: 2.4 },
  { a: 'KTCS', b: 'KPHX', weight: 1.9 },
  { a: 'KTCS', b: 'KDEN', weight: 1.7 },
  { a: 'KTAD', b: 'KDEN', weight: 2.4 },
  { a: 'KTAD', b: 'KABQ', weight: 2.0 },
  { a: 'KTAD', b: 'KPHX', weight: 1.6 },
  // CA bush soft-fields ↔ CA gateways
  { a: 'CYHE', b: 'CYVR', weight: 2.4 },
  { a: 'CYHE', b: 'CYYC', weight: 1.7 },
  { a: 'CYJA', b: 'CYEG', weight: 2.3 },
  { a: 'CYJA', b: 'CYYC', weight: 2.1 },
  { a: 'CYJA', b: 'CYVR', weight: 1.7 },
  { a: 'CYHH', b: 'CYMT', weight: 2.4 },
  { a: 'CYHH', b: 'CYWG', weight: 1.8 },
  { a: 'CYHH', b: 'CYYZ', weight: 1.6 },
  // MX bush soft-fields ↔ MX gateways
  { a: 'MMCG', b: 'MMCU', weight: 2.4 },
  { a: 'MMCG', b: 'MMHO', weight: 2.0 },
  { a: 'MMCG', b: 'MMMY', weight: 1.8 },
  { a: 'MM68', b: 'MMCU', weight: 2.3 },
  { a: 'MM68', b: 'MMMY', weight: 1.9 },
  { a: 'MM68', b: 'MMGL', weight: 1.6 },
  { a: 'SBBE', b: 'SBGR', weight: 1.6 },
  { a: 'SBBE', b: 'SBRF', weight: 1.4 },
  // Center-West feeders
  { a: 'SBGO', b: 'SBGR', weight: 1.6 },
  { a: 'SBGO', b: 'SBKP', weight: 1.4 },
  { a: 'SBCY', b: 'SBGR', weight: 1.4 },
  { a: 'SBCG', b: 'SBGR', weight: 1.4 },
  { a: 'SBCG', b: 'SBPA', weight: 1.3 },
  // Cone Sul domestic trunks (AR / CL)
  { a: 'SAEZ', b: 'SABE', weight: 2.0 },
  { a: 'SAEZ', b: 'SACO', weight: 1.9 },
  { a: 'SAEZ', b: 'SAME', weight: 1.7 },
  { a: 'SAEZ', b: 'SAAR', weight: 1.8 },
  { a: 'SABE', b: 'SAAR', weight: 1.6 },
  { a: 'SACO', b: 'SAME', weight: 1.5 },
  { a: 'SAEZ', b: 'SANT', weight: 1.5 },
  { a: 'SAEZ', b: 'SAZS', weight: 1.6 },
  { a: 'SAEZ', b: 'SAVN', weight: 1.5 },
  { a: 'SAEZ', b: 'SAZN', weight: 1.5 },
  { a: 'SAZN', b: 'SAVN', weight: 1.4 },
  { a: 'SCEL', b: 'SCTE', weight: 1.8 },
  { a: 'SCEL', b: 'SCIE', weight: 1.7 },
  { a: 'SCEL', b: 'SCFA', weight: 1.7 },
  { a: 'SCEL', b: 'SCDA', weight: 1.6 },
  { a: 'SCEL', b: 'SCCI', weight: 1.5 },
  { a: 'SCTE', b: 'SCBA', weight: 1.4 },
  // South / NE regional trunks
  { a: 'SBPA', b: 'SBCT', weight: 1.5 },
  { a: 'SBCT', b: 'SBFL', weight: 1.4 },
  { a: 'SBPA', b: 'SBNF', weight: 1.3 },
  { a: 'SBRF', b: 'SBFZ', weight: 1.5 },
  { a: 'SBRF', b: 'SBSV', weight: 1.5 },
  { a: 'SBSV', b: 'SBFZ', weight: 1.3 },
  // Spoke feeders (SE/S/NE)
  { a: 'SBVT', b: 'SBGR', weight: 1.5 },
  { a: 'SBVT', b: 'SBGL', weight: 1.4 },
  { a: 'SBRP', b: 'SBKP', weight: 1.5 },
  { a: 'SBRP', b: 'SBGR', weight: 1.4 },
  { a: 'SBLO', b: 'SBCT', weight: 1.4 },
  { a: 'SBLO', b: 'SBKP', weight: 1.3 },
  { a: 'SBJV', b: 'SBCT', weight: 1.4 },
  { a: 'SBFL', b: 'SBPA', weight: 1.3 },
  { a: 'SBPS', b: 'SBSV', weight: 1.4 },
  { a: 'SBAR', b: 'SBSV', weight: 1.3 },
  { a: 'SBMO', b: 'SBRF', weight: 1.4 },
  { a: 'SBJP', b: 'SBRF', weight: 1.4 },
  { a: 'SBSG', b: 'SBRF', weight: 1.3 },
  { a: 'SBSG', b: 'SBFZ', weight: 1.3 },
  // US domestic trunks + feeders
  { a: 'KMIA', b: 'KJFK', weight: 1.8 },
  { a: 'KMIA', b: 'KIAH', weight: 1.7 },
  { a: 'KJFK', b: 'KIAH', weight: 1.5 },
  { a: 'KORD', b: 'KJFK', weight: 2.2 },
  { a: 'KATL', b: 'KMIA', weight: 2.0 },
  { a: 'KATL', b: 'KORD', weight: 2.1 },
  { a: 'KDFW', b: 'KIAH', weight: 2.0 },
  { a: 'KDFW', b: 'KORD', weight: 1.9 },
  { a: 'KLAX', b: 'KSEA', weight: 2.0 },
  { a: 'KLAX', b: 'KDEN', weight: 1.9 },
  { a: 'KDEN', b: 'KORD', weight: 2.0 },
  { a: 'KSEA', b: 'KORD', weight: 1.7 },
  { a: 'KATL', b: 'KJFK', weight: 1.8 },
  { a: 'KLAX', b: 'KDFW', weight: 1.8 },
  { a: 'KMEM', b: 'KATL', weight: 1.6 },
  { a: 'KMEM', b: 'KORD', weight: 1.5 },
  { a: 'KMEM', b: 'KDFW', weight: 1.7 },
  { a: 'KMEM', b: 'KIAH', weight: 1.6 },
  // US regional feeders
  { a: 'KBOS', b: 'KJFK', weight: 1.7 },
  { a: 'KBOS', b: 'KORD', weight: 1.5 },
  { a: 'KEWR', b: 'KJFK', weight: 1.8 },
  { a: 'KEWR', b: 'KORD', weight: 1.6 },
  { a: 'KPHL', b: 'KJFK', weight: 1.5 },
  { a: 'KCLT', b: 'KATL', weight: 1.7 },
  { a: 'KCLT', b: 'KJFK', weight: 1.5 },
  { a: 'KMCO', b: 'KMIA', weight: 1.6 },
  { a: 'KFLL', b: 'KMIA', weight: 1.7 },
  { a: 'KDTW', b: 'KORD', weight: 1.6 },
  { a: 'KDTW', b: 'KATL', weight: 1.4 },
  { a: 'KMSP', b: 'KORD', weight: 1.6 },
  { a: 'KMSP', b: 'KDEN', weight: 1.5 },
  { a: 'KCVG', b: 'KORD', weight: 1.4 },
  { a: 'KAUS', b: 'KDFW', weight: 1.5 },
  { a: 'KAUS', b: 'KIAH', weight: 1.4 },
  { a: 'KPHX', b: 'KDEN', weight: 1.5 },
  { a: 'KPHX', b: 'KLAX', weight: 1.6 },
  { a: 'KSLC', b: 'KDEN', weight: 1.5 },
  { a: 'KSFO', b: 'KLAX', weight: 1.8 },
  { a: 'KSFO', b: 'KSEA', weight: 1.6 },
  { a: 'KSAN', b: 'KLAX', weight: 1.6 },
  // Canada domestic trunks
  { a: 'CYYZ', b: 'CYVR', weight: 2.2 },
  { a: 'CYYZ', b: 'CYUL', weight: 2.0 },
  { a: 'CYYZ', b: 'CYYC', weight: 1.9 },
  { a: 'CYYZ', b: 'CYEG', weight: 1.7 },
  { a: 'CYVR', b: 'CYYC', weight: 1.8 },
  { a: 'CYYZ', b: 'CYWG', weight: 1.6 },
  { a: 'CYYZ', b: 'CYOW', weight: 1.7 },
  { a: 'CYYZ', b: 'CYHZ', weight: 1.6 },
  { a: 'CYUL', b: 'CYQB', weight: 1.5 },
  { a: 'CYVR', b: 'CYYJ', weight: 1.6 },
  // Mexico domestic trunks
  { a: 'MMMX', b: 'MMMY', weight: 2.1 },
  { a: 'MMMX', b: 'MMGL', weight: 2.0 },
  { a: 'MMMX', b: 'MMUN', weight: 1.9 },
  { a: 'MMMY', b: 'MMTJ', weight: 1.7 },
  { a: 'MMMX', b: 'MMTJ', weight: 1.5 },
  { a: 'MMGL', b: 'MMMY', weight: 1.6 },
  { a: 'MMMX', b: 'MMVR', weight: 1.5 },
  { a: 'MMUN', b: 'MMSD', weight: 1.4 },
  { a: 'MMMX', b: 'MMPR', weight: 1.5 },
  // Uruguay / Paraguay domestic trunks
  { a: 'SUMU', b: 'SULS', weight: 1.7 },
  { a: 'SUMU', b: 'SUPU', weight: 1.5 },
  { a: 'SGAS', b: 'SGES', weight: 2.0 },
  { a: 'SGAS', b: 'SGEN', weight: 1.5 },
  // Peru domestic trunks
  { a: 'SPJC', b: 'SPZO', weight: 2.0 },
  { a: 'SPJC', b: 'SPQU', weight: 1.8 },
  { a: 'SPJC', b: 'SPRU', weight: 1.7 },
  { a: 'SPJC', b: 'SPQT', weight: 1.6 },
  // Bolivia domestic trunks
  { a: 'SLLP', b: 'SLVR', weight: 2.1 },
  { a: 'SLLP', b: 'SLCB', weight: 1.8 },
  { a: 'SLVR', b: 'SLCB', weight: 1.6 },
  // Ecuador domestic trunks
  { a: 'SEQU', b: 'SEGU', weight: 2.1 },
  { a: 'SEGU', b: 'SECU', weight: 1.6 },
  { a: 'SEQU', b: 'SEMT', weight: 1.5 },
  // Colombia domestic trunks
  { a: 'SKBO', b: 'SKRG', weight: 2.2 },
  { a: 'SKBO', b: 'SKCL', weight: 2.0 },
  { a: 'SKBO', b: 'SKCG', weight: 1.8 },
  { a: 'SKRG', b: 'SKCL', weight: 1.7 },
  { a: 'SKBQ', b: 'SKCG', weight: 1.6 },
  // Venezuela domestic trunks
  { a: 'SVMI', b: 'SVMC', weight: 1.9 },
  { a: 'SVMI', b: 'SVVA', weight: 1.8 },
  { a: 'SVMI', b: 'SVPR', weight: 1.6 },
  { a: 'SVMI', b: 'SVMG', weight: 1.5 },
  // Guianas domestic
  { a: 'SYCJ', b: 'SYEC', weight: 1.6 },
  { a: 'SMJP', b: 'SMZO', weight: 1.6 },
  // Central America domestic trunks
  { a: 'MPTO', b: 'MPMG', weight: 2.0 },
  { a: 'MPTO', b: 'MPDA', weight: 1.8 },
  { a: 'MPTO', b: 'MPBO', weight: 1.5 },
  { a: 'MROC', b: 'MRLB', weight: 1.9 },
  { a: 'MROC', b: 'MRPV', weight: 1.7 },
  { a: 'MROC', b: 'MRLM', weight: 1.6 },
  { a: 'MNMG', b: 'MNPC', weight: 1.7 },
  { a: 'MNMG', b: 'MNBL', weight: 1.5 },
  { a: 'MHTG', b: 'MHLM', weight: 2.0 },
  { a: 'MHLM', b: 'MHLC', weight: 1.7 },
  { a: 'MHTG', b: 'MHRO', weight: 1.5 },
  { a: 'MSLP', b: 'MSSS', weight: 1.8 },
  { a: 'MGGT', b: 'MGMM', weight: 1.8 },
  { a: 'MGGT', b: 'MGSJ', weight: 1.6 },
  { a: 'MZBZ', b: 'MZPL', weight: 1.6 },
  // Caribbean domestic trunks (light — intl carries regional trade)
  { a: 'MUHA', b: 'MUCU', weight: 1.8 },
  { a: 'MUHA', b: 'MUVR', weight: 1.6 },
  { a: 'MDSD', b: 'MDPC', weight: 1.9 },
  { a: 'MDSD', b: 'MDST', weight: 1.7 },
  { a: 'MTPP', b: 'MTCH', weight: 1.5 },
  { a: 'MKJP', b: 'MKJS', weight: 1.9 },
  { a: 'MYNN', b: 'MYGF', weight: 1.6 },
  { a: 'TTPP', b: 'TTCP', weight: 1.7 },
  { a: 'TLPL', b: 'TLPC', weight: 1.5 },
  { a: 'TAPA', b: 'TAPH', weight: 1.4 },
  // Puerto Rico domestic US trunks (US-PR ↔ continental SE/NE)
  { a: 'TJSJ', b: 'KMIA', weight: 2.1 },
  { a: 'TJSJ', b: 'KEWR', weight: 1.8 },
  { a: 'TJSJ', b: 'TJBQ', weight: 1.6 },
  { a: 'TJSJ', b: 'TJPS', weight: 1.5 },
  // U.S. Virgin Islands domestic US trunks (US-VI ↔ SE + inter-island)
  { a: 'TIST', b: 'KMIA', weight: 1.9 },
  { a: 'TIST', b: 'TISX', weight: 1.7 },
  { a: 'TISX', b: 'KMIA', weight: 1.5 },
  // FR/NL Caribbean territory domestic
  { a: 'TFFR', b: 'TFFM', weight: 1.4 },
  // EU-1 Western core domestic trunks
  { a: 'LPPT', b: 'LPPR', weight: 2.0 },
  { a: 'LPPT', b: 'LPFR', weight: 1.8 },
  { a: 'LEMD', b: 'LEBL', weight: 2.2 },
  { a: 'LEMD', b: 'LEMG', weight: 1.9 },
  { a: 'LEMD', b: 'LEBB', weight: 1.8 },
  { a: 'LEBL', b: 'LEAL', weight: 1.7 },
  { a: 'LFPG', b: 'LFPO', weight: 1.6 },
  { a: 'LFPG', b: 'LFLL', weight: 2.1 },
  { a: 'LFPG', b: 'LFML', weight: 2.0 },
  { a: 'LFLL', b: 'LFML', weight: 1.8 },
  { a: 'LFML', b: 'LFMN', weight: 1.6 },
  { a: 'EGLL', b: 'EGKK', weight: 1.5 },
  { a: 'EGLL', b: 'EGCC', weight: 2.1 },
  { a: 'EGCC', b: 'EGPH', weight: 1.9 },
  { a: 'EGPH', b: 'EGPF', weight: 1.6 },
  { a: 'EDDF', b: 'EDDM', weight: 2.1 },
  { a: 'EDDF', b: 'EDDB', weight: 2.0 },
  { a: 'EDDF', b: 'EDDH', weight: 1.9 },
  { a: 'EDDM', b: 'EDDS', weight: 1.7 },
  { a: 'EHAM', b: 'EHRD', weight: 1.6 },
  { a: 'EHAM', b: 'EHEH', weight: 1.5 },
  { a: 'EBBR', b: 'EBAW', weight: 1.5 },
  { a: 'EBBR', b: 'EBCI', weight: 1.4 },
  { a: 'LIRF', b: 'LIMC', weight: 2.1 },
  { a: 'LIRF', b: 'LIRN', weight: 1.9 },
  { a: 'LIMC', b: 'LIPE', weight: 1.7 },
  { a: 'LIRN', b: 'LICC', weight: 1.6 },
  // EU-2 Nordics + Alps + IE domestic trunks
  { a: 'EIDW', b: 'EINN', weight: 1.9 },
  { a: 'EIDW', b: 'EICK', weight: 1.7 },
  { a: 'EKCH', b: 'EKBI', weight: 1.8 },
  { a: 'EKCH', b: 'EKYT', weight: 1.6 },
  { a: 'ENGM', b: 'ENBR', weight: 2.0 },
  { a: 'ENGM', b: 'ENVA', weight: 1.8 },
  { a: 'ENBR', b: 'ENZV', weight: 1.6 },
  { a: 'ESSA', b: 'ESGG', weight: 2.0 },
  { a: 'ESSA', b: 'ESPA', weight: 1.7 },
  { a: 'ESGG', b: 'ESMQ', weight: 1.5 },
  { a: 'EFHK', b: 'EFTU', weight: 1.8 },
  { a: 'EFHK', b: 'EFRO', weight: 1.6 },
  { a: 'LSZH', b: 'LSGG', weight: 1.9 },
  { a: 'LOWW', b: 'LOWI', weight: 1.8 },
  { a: 'LOWW', b: 'LOWS', weight: 1.7 },
  // EU-3 Central-East + Baltics domestic trunks
  { a: 'EPWA', b: 'EPGD', weight: 2.0 },
  { a: 'EPWA', b: 'EPKK', weight: 1.9 },
  { a: 'EPWA', b: 'EPKT', weight: 1.8 },
  { a: 'EPGD', b: 'EPSC', weight: 1.5 },
  { a: 'EPKK', b: 'EPKT', weight: 1.6 },
  { a: 'LKPR', b: 'LKTB', weight: 1.9 },
  { a: 'LKPR', b: 'LKMT', weight: 1.7 },
  { a: 'LZIB', b: 'LZKZ', weight: 1.8 },
  { a: 'LHBP', b: 'LHDC', weight: 1.8 },
  { a: 'EETN', b: 'EETU', weight: 1.5 },
  { a: 'EVRA', b: 'EVLA', weight: 1.5 },
  { a: 'EYVI', b: 'EYKA', weight: 1.7 },
  { a: 'EYVI', b: 'EYPA', weight: 1.5 },
  // EU-4 Balkans domestic trunks
  { a: 'LDZA', b: 'LDSP', weight: 1.8 },
  { a: 'LDZA', b: 'LDDU', weight: 1.6 },
  { a: 'LDSP', b: 'LDDU', weight: 1.5 },
  { a: 'LJLJ', b: 'LJMB', weight: 1.5 },
  { a: 'LROP', b: 'LRCL', weight: 1.9 },
  { a: 'LROP', b: 'LRTR', weight: 1.8 },
  { a: 'LROP', b: 'LRIA', weight: 1.7 },
  { a: 'LBSF', b: 'LBWN', weight: 1.8 },
  { a: 'LBSF', b: 'LBBG', weight: 1.7 },
  { a: 'LGAV', b: 'LGTS', weight: 2.0 },
  { a: 'LGAV', b: 'LGIR', weight: 1.8 },
  { a: 'LGTS', b: 'LGAL', weight: 1.5 },
  { a: 'LYBE', b: 'LYNI', weight: 1.7 },
  // EU-5 Iceland domestic trunks
  { a: 'BIKF', b: 'BIRK', weight: 1.9 },
  { a: 'BIKF', b: 'BIAR', weight: 1.8 },
  { a: 'BIAR', b: 'BIEG', weight: 1.5 },
  // EU-6 W. Balkans domestic trunks
  { a: 'LQSA', b: 'LQBK', weight: 1.7 },
  { a: 'LQSA', b: 'LQTZ', weight: 1.6 },
  { a: 'LQSA', b: 'LQMO', weight: 1.5 },
  { a: 'LYPG', b: 'LYTV', weight: 1.6 },
  { a: 'LATI', b: 'LAKU', weight: 1.5 },
  { a: 'LWSK', b: 'LWOH', weight: 1.6 },
  // EU-7 East domestic trunks
  { a: 'LTFM', b: 'LTFJ', weight: 2.0 },
  { a: 'LTFM', b: 'LTBJ', weight: 1.9 },
  { a: 'LTFM', b: 'LTAC', weight: 2.0 },
  { a: 'LTAC', b: 'LTAI', weight: 1.8 },
  { a: 'LTAC', b: 'LTAJ', weight: 1.7 },
  { a: 'LTAC', b: 'LTCG', weight: 1.6 },
  { a: 'UKBB', b: 'UKKK', weight: 1.8 },
  { a: 'UKBB', b: 'UKLL', weight: 1.9 },
  { a: 'UKBB', b: 'UKOO', weight: 1.8 },
  { a: 'UKBB', b: 'UKHH', weight: 1.8 },
  { a: 'UKHH', b: 'UKDD', weight: 1.5 },
  // EU-8 Europe gaps domestic trunks
  { a: 'UMMS', b: 'UMBB', weight: 1.7 },
  { a: 'UMMS', b: 'UMGG', weight: 1.6 },
  { a: 'LUKK', b: 'LUBM', weight: 1.5 },
  { a: 'UGTB', b: 'UGSB', weight: 1.6 },
  { a: 'UDYZ', b: 'UDSG', weight: 1.5 },
  { a: 'UBBB', b: 'UBBG', weight: 1.6 },
  { a: 'LCLK', b: 'LCPH', weight: 1.6 },
  // MENA-1 Mediterranean face domestic trunks
  { a: 'GMMN', b: 'GMTT', weight: 2.0 },
  { a: 'GMMN', b: 'GMMX', weight: 1.9 },
  { a: 'GMMN', b: 'GMAD', weight: 1.7 },
  { a: 'GMMN', b: 'GMME', weight: 1.8 },
  { a: 'GMTT', b: 'GMFF', weight: 1.5 },
  { a: 'DAAG', b: 'DAOO', weight: 1.9 },
  { a: 'DAAG', b: 'DAAE', weight: 1.6 },
  { a: 'DAAG', b: 'DABC', weight: 1.7 },
  { a: 'DTTA', b: 'DTMB', weight: 1.8 },
  { a: 'DTTA', b: 'DTTJ', weight: 1.6 },
  { a: 'HECA', b: 'HEBA', weight: 2.0 },
  { a: 'HECA', b: 'HESH', weight: 1.8 },
  { a: 'HECA', b: 'HEGN', weight: 1.8 },
  { a: 'HECA', b: 'HELX', weight: 1.6 },
  { a: 'LLBG', b: 'LLHA', weight: 1.8 },
  { a: 'LLBG', b: 'LLER', weight: 1.6 },
  // MENA-2 Gulf domestic trunks
  { a: 'OEJN', b: 'OEMA', weight: 2.0 },
  { a: 'OEJN', b: 'OETF', weight: 1.7 },
  { a: 'OEJN', b: 'OEAB', weight: 1.6 },
  { a: 'OEJN', b: 'OEYN', weight: 1.6 },
  { a: 'OERK', b: 'OEGS', weight: 1.9 },
  { a: 'OERK', b: 'OEHL', weight: 1.6 },
  { a: 'OERK', b: 'OEJN', weight: 2.1 },
  { a: 'OERK', b: 'OEDF', weight: 2.0 },
  { a: 'OEDF', b: 'OEAH', weight: 1.7 },
  { a: 'OMDB', b: 'OMSJ', weight: 2.0 },
  { a: 'OMDB', b: 'OMRK', weight: 1.6 },
  { a: 'OMDB', b: 'OMFJ', weight: 1.5 },
  { a: 'OMDB', b: 'OMAA', weight: 2.0 },
  { a: 'OMAA', b: 'OMAL', weight: 1.8 },
  { a: 'OTHH', b: 'OTBD', weight: 1.5 },
  { a: 'OOMS', b: 'OOSH', weight: 1.9 },
  { a: 'OOMS', b: 'OOKB', weight: 1.5 },
  { a: 'OOMS', b: 'OOSA', weight: 1.7 },
  // MENA-3 North Gulf domestic trunks
  { a: 'ORBI', b: 'ORNI', weight: 1.8 },
  { a: 'ORBI', b: 'ORMM', weight: 2.0 },
  { a: 'ORBI', b: 'ORER', weight: 1.9 },
  { a: 'ORER', b: 'ORSU', weight: 1.6 },
  { a: 'ORER', b: 'ORBM', weight: 1.5 },
  { a: 'OIIE', b: 'OIII', weight: 2.0 },
  { a: 'OIIE', b: 'OIFM', weight: 1.9 },
  { a: 'OIIE', b: 'OIMM', weight: 1.7 },
  { a: 'OIIE', b: 'OITT', weight: 1.6 },
  { a: 'OIIE', b: 'OISS', weight: 1.9 },
  { a: 'OISS', b: 'OIKB', weight: 1.8 },
  { a: 'OISS', b: 'OIKK', weight: 1.5 },
  // MENA-4 Levant-east domestic trunks
  { a: 'OJAI', b: 'OJAM', weight: 1.8 },
  { a: 'OJAI', b: 'OJAQ', weight: 1.9 },
  { a: 'OSDI', b: 'OSAP', weight: 1.8 },
  { a: 'OSDI', b: 'OSLK', weight: 1.6 },
  // MENA-5 Maghreb/Nile gap domestic trunks
  { a: 'HLLM', b: 'HLMS', weight: 1.8 },
  { a: 'HLLM', b: 'HLLB', weight: 1.9 },
  { a: 'HSSK', b: 'HSOB', weight: 1.6 },
  { a: 'HSSK', b: 'HSPN', weight: 1.9 },
  // MENA-6 Yemen domestic trunks
  { a: 'OYSN', b: 'OYHD', weight: 1.8 },
  { a: 'OYSN', b: 'OYAA', weight: 2.0 },
  { a: 'OYAA', b: 'OYRN', weight: 1.6 },
  // Asia-1 Pakistan domestic trunks
  { a: 'OPIS', b: 'OPLA', weight: 2.0 },
  { a: 'OPIS', b: 'OPPS', weight: 1.8 },
  { a: 'OPKC', b: 'OPQT', weight: 1.7 },
  { a: 'OPKC', b: 'OPMT', weight: 1.8 },
  { a: 'OPKC', b: 'OPIS', weight: 2.0 },
  { a: 'OPLA', b: 'OPMT', weight: 1.6 },
  // Asia-2 India west domestic trunks
  { a: 'VIDP', b: 'VIAR', weight: 1.8 },
  { a: 'VIDP', b: 'VIJP', weight: 1.9 },
  { a: 'VIJP', b: 'VIJO', weight: 1.5 },
  { a: 'VABB', b: 'VAPO', weight: 1.9 },
  { a: 'VABB', b: 'VAAH', weight: 1.8 },
  { a: 'VABB', b: 'VOGO', weight: 1.6 },
  { a: 'VIDP', b: 'VABB', weight: 2.0 },
  { a: 'VAAH', b: 'VIJP', weight: 1.6 },
  // Asia-3 India south / east domestic trunks
  { a: 'VOBL', b: 'VOMM', weight: 1.9 },
  { a: 'VOBL', b: 'VOHS', weight: 1.8 },
  { a: 'VOMM', b: 'VOCI', weight: 1.6 },
  { a: 'VOBL', b: 'VIDP', weight: 1.8 },
  { a: 'VOBL', b: 'VABB', weight: 1.8 },
  { a: 'VECC', b: 'VEBS', weight: 1.6 },
  { a: 'VECC', b: 'VEGT', weight: 1.7 },
  { a: 'VECC', b: 'VEPT', weight: 1.5 },
  { a: 'VECC', b: 'VIDP', weight: 1.8 },
  { a: 'VOMM', b: 'VECC', weight: 1.7 },
  // Asia-4 Sri Lanka domestic trunks
  { a: 'VCBI', b: 'VCCC', weight: 1.8 },
  { a: 'VCBI', b: 'VCRI', weight: 1.7 },
  { a: 'VCBI', b: 'VCCJ', weight: 1.6 },
  { a: 'VCRI', b: 'VCCJ', weight: 1.4 },
  // Asia-5 Central Asia domestic trunks
  { a: 'UAAA', b: 'UAII', weight: 1.8 },
  { a: 'UACC', b: 'UAAA', weight: 2.0 },
  { a: 'UACC', b: 'UATE', weight: 1.6 },
  { a: 'UAII', b: 'UACC', weight: 1.5 },
  { a: 'UTTT', b: 'UTSS', weight: 1.9 },
  { a: 'UTSS', b: 'UTSB', weight: 1.7 },
  { a: 'UTTT', b: 'UTNN', weight: 1.5 },
  { a: 'UTSB', b: 'UTNN', weight: 1.4 },
  { a: 'UTAA', b: 'UTAK', weight: 1.8 },
  // Asia-6 Tajikistan / Kyrgyzstan domestic trunks
  { a: 'UTDD', b: 'UTDL', weight: 1.8 },
  { a: 'UCFM', b: 'UCFL', weight: 1.6 },
  { a: 'UCFM', b: 'UCFO', weight: 1.8 },
  // Asia-7 Afghanistan domestic trunks
  { a: 'OAKB', b: 'OAMS', weight: 1.7 },
  { a: 'OAKB', b: 'OAKN', weight: 1.8 },
  { a: 'OAKN', b: 'OAHR', weight: 1.6 },
  { a: 'OAKB', b: 'OAHR', weight: 1.5 },
  // Asia-8 Nepal / Bangladesh domestic trunks
  { a: 'VNKT', b: 'VNPK', weight: 1.7 },
  { a: 'VNKT', b: 'VNBW', weight: 1.6 },
  { a: 'VGHS', b: 'VGEG', weight: 1.9 },
  { a: 'VGHS', b: 'VGSY', weight: 1.6 },
  { a: 'VGHS', b: 'VGRJ', weight: 1.5 },
  { a: 'VGEG', b: 'VGSY', weight: 1.4 },
  // Asia-9 Bhutan / Myanmar domestic trunks
  { a: 'VQPR', b: 'VQGP', weight: 1.6 },
  { a: 'VYYY', b: 'VYNT', weight: 1.7 },
  { a: 'VYNT', b: 'VYMD', weight: 1.8 },
  { a: 'VYYY', b: 'VYSW', weight: 1.5 },
  { a: 'VYMD', b: 'VYSW', weight: 1.4 },
];

export const CAREER_CARGO_CORRIDORS: ReadonlyArray<{
  a: string;
  b: string;
  weight: number;
}> = [
  ...CAREER_CARGO_CORRIDORS_MANUAL,
  ...buildBrFeederCorridors(BR_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildUsFeederCorridors(US_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildCaFeederCorridors(CA_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildMxFeederCorridors(MX_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildArFeederCorridors(AR_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildClFeederCorridors(CL_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildUyFeederCorridors(UY_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildPyFeederCorridors(PY_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildPeFeederCorridors(PE_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildBoFeederCorridors(BO_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildEcFeederCorridors(EC_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildCoFeederCorridors(CO_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildVeFeederCorridors(VE_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildGyFeederCorridors(GY_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildSrFeederCorridors(SR_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildGfFeederCorridors(GF_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildPaFeederCorridors(PA_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildCrFeederCorridors(CR_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildNiFeederCorridors(NI_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildHnFeederCorridors(HN_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildSvFeederCorridors(SV_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildGtFeederCorridors(GT_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildBzFeederCorridors(BZ_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildCuFeederCorridors(CU_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildDoFeederCorridors(DO_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildHtFeederCorridors(HT_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildJmFeederCorridors(JM_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildBsFeederCorridors(BS_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildTtFeederCorridors(TT_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildBbFeederCorridors(BB_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildLcFeederCorridors(LC_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildGdFeederCorridors(GD_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildAgFeederCorridors(AG_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildGpFeederCorridors(GP_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildMqFeederCorridors(MQ_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildCwFeederCorridors(CW_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildSxFeederCorridors(SX_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildAwFeederCorridors(AW_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildPtFeederCorridors(PT_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildEsFeederCorridors(ES_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildFrFeederCorridors(FR_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildGbFeederCorridors(GB_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildDeFeederCorridors(DE_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildNlFeederCorridors(NL_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildBeFeederCorridors(BE_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildItFeederCorridors(IT_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildIeFeederCorridors(IE_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildDkFeederCorridors(DK_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildNoFeederCorridors(NO_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildSeFeederCorridors(SE_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildFiFeederCorridors(FI_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildChFeederCorridors(CH_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildAtFeederCorridors(AT_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildPlFeederCorridors(PL_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildCzFeederCorridors(CZ_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildSkFeederCorridors(SK_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildHuFeederCorridors(HU_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildEeFeederCorridors(EE_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildLvFeederCorridors(LV_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildLtFeederCorridors(LT_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildHrFeederCorridors(HR_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildSiFeederCorridors(SI_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildRoFeederCorridors(RO_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildBgFeederCorridors(BG_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildGrFeederCorridors(GR_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildRsFeederCorridors(RS_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildIsFeederCorridors(IS_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildBaFeederCorridors(BA_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildMeFeederCorridors(ME_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildAlFeederCorridors(AL_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildMkFeederCorridors(MK_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildTrFeederCorridors(TR_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildUaFeederCorridors(UA_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildByFeederCorridors(BY_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildMdFeederCorridors(MD_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildGeFeederCorridors(GE_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildAmFeederCorridors(AM_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildAzFeederCorridors(AZ_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildLuFeederCorridors(LU_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildMtFeederCorridors(MT_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildCyFeederCorridors(CY_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildXkFeederCorridors(XK_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildMaFeederCorridors(MA_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildDzFeederCorridors(DZ_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildTnFeederCorridors(TN_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildEgFeederCorridors(EG_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildIlFeederCorridors(IL_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildSaFeederCorridors(SA_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildAeFeederCorridors(AE_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildQaFeederCorridors(QA_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildBhFeederCorridors(BH_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildKwFeederCorridors(KW_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildOmFeederCorridors(OM_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildIqFeederCorridors(IQ_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildIrFeederCorridors(IR_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildJoFeederCorridors(JO_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildLbFeederCorridors(LB_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildSyFeederCorridors(SY_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildLyFeederCorridors(LY_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildSdFeederCorridors(SD_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildYeFeederCorridors(YE_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildPkFeederCorridors(PK_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildInFeederCorridors(IN_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildLkFeederCorridors(LK_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildKzFeederCorridors(KZ_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildUzFeederCorridors(UZ_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildTmFeederCorridors(TM_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildTjFeederCorridors(TJ_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildKgFeederCorridors(KG_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildAfFeederCorridors(AF_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildNpFeederCorridors(NP_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildBdFeederCorridors(BD_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildBtFeederCorridors(BT_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildMmFeederCorridors(MM_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
];

/** Default corridor weight when an international lane has no domestic corridor entry. */
export const INTERNATIONAL_CORRIDOR_WEIGHT = 2.0;
/** Pay distance bias for cross-country lots (domestic cross-region is 1.12). */
export const INTERNATIONAL_DISTANCE_BIAS = 1.55;
/** Extra lot lifetime for long-haul international freights. */
export const INTERNATIONAL_LIFE_MULT = 1.35;
/** Emergency domestic release valve for non-major warehouses pinned near capacity. */
const DOMESTIC_OVERFLOW_ORIGIN_FILL = 0.9;
const DOMESTIC_OVERFLOW_DEST_FILL = 0.35;
const DOMESTIC_OVERFLOW_CORRIDOR_WEIGHT = 1.1;

/**
 * Sparse international hub lanes (stored directed; matching is bidirectional).
 * Soft capacityKgPerDay caps active freight on the OD.
 */
export const CAREER_INTERNATIONAL_LANES: ReadonlyArray<InternationalLane> = [
  {
    id: 'lane_sbgr_kmia',
    originCountryId: 'BR',
    destCountryId: 'US',
    originIcao: 'SBGR',
    destIcao: 'KMIA',
    capacityKgPerDay: 90_000,
  },
  {
    id: 'lane_sbkp_kmia',
    originCountryId: 'BR',
    destCountryId: 'US',
    originIcao: 'SBKP',
    destIcao: 'KMIA',
    capacityKgPerDay: 70_000,
  },
  {
    id: 'lane_sbgl_kmia',
    originCountryId: 'BR',
    destCountryId: 'US',
    originIcao: 'SBGL',
    destIcao: 'KMIA',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_sbgr_kjfk',
    originCountryId: 'BR',
    destCountryId: 'US',
    originIcao: 'SBGR',
    destIcao: 'KJFK',
    capacityKgPerDay: 60_000,
  },
  {
    id: 'lane_sbeg_kmia',
    originCountryId: 'BR',
    destCountryId: 'US',
    originIcao: 'SBEG',
    destIcao: 'KMIA',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_sbgr_kiah',
    originCountryId: 'BR',
    destCountryId: 'US',
    originIcao: 'SBGR',
    destIcao: 'KIAH',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_sbgl_kiah',
    originCountryId: 'BR',
    destCountryId: 'US',
    originIcao: 'SBGL',
    destIcao: 'KIAH',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_sbgr_katl',
    originCountryId: 'BR',
    destCountryId: 'US',
    originIcao: 'SBGR',
    destIcao: 'KATL',
    capacityKgPerDay: 65_000,
  },
  {
    id: 'lane_sbgr_kord',
    originCountryId: 'BR',
    destCountryId: 'US',
    originIcao: 'SBGR',
    destIcao: 'KORD',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_sbeg_kmem',
    originCountryId: 'BR',
    destCountryId: 'US',
    originIcao: 'SBEG',
    destIcao: 'KMEM',
    capacityKgPerDay: 35_000,
  },
  // US ↔ Canada gateways
  {
    id: 'lane_cyyz_kjfk',
    originCountryId: 'CA',
    destCountryId: 'US',
    originIcao: 'CYYZ',
    destIcao: 'KJFK',
    capacityKgPerDay: 70_000,
  },
  {
    id: 'lane_cyyz_kord',
    originCountryId: 'CA',
    destCountryId: 'US',
    originIcao: 'CYYZ',
    destIcao: 'KORD',
    capacityKgPerDay: 65_000,
  },
  {
    id: 'lane_cyvr_ksea',
    originCountryId: 'CA',
    destCountryId: 'US',
    originIcao: 'CYVR',
    destIcao: 'KSEA',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_cyvr_klax',
    originCountryId: 'CA',
    destCountryId: 'US',
    originIcao: 'CYVR',
    destIcao: 'KLAX',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_cyul_kjfk',
    originCountryId: 'CA',
    destCountryId: 'US',
    originIcao: 'CYUL',
    destIcao: 'KJFK',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_cyyc_ksea',
    originCountryId: 'CA',
    destCountryId: 'US',
    originIcao: 'CYYC',
    destIcao: 'KSEA',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_cyeg_kden',
    originCountryId: 'CA',
    destCountryId: 'US',
    originIcao: 'CYEG',
    destIcao: 'KDEN',
    capacityKgPerDay: 35_000,
  },
  // US ↔ Mexico gateways
  {
    id: 'lane_mmmx_kiah',
    originCountryId: 'MX',
    destCountryId: 'US',
    originIcao: 'MMMX',
    destIcao: 'KIAH',
    capacityKgPerDay: 75_000,
  },
  {
    id: 'lane_mmmx_kdfw',
    originCountryId: 'MX',
    destCountryId: 'US',
    originIcao: 'MMMX',
    destIcao: 'KDFW',
    capacityKgPerDay: 65_000,
  },
  {
    id: 'lane_mmmy_kiah',
    originCountryId: 'MX',
    destCountryId: 'US',
    originIcao: 'MMMY',
    destIcao: 'KIAH',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_mmtj_klax',
    originCountryId: 'MX',
    destCountryId: 'US',
    originIcao: 'MMTJ',
    destIcao: 'KLAX',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_mmun_kmia',
    originCountryId: 'MX',
    destCountryId: 'US',
    originIcao: 'MMUN',
    destIcao: 'KMIA',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_mmgl_kiah',
    originCountryId: 'MX',
    destCountryId: 'US',
    originIcao: 'MMGL',
    destIcao: 'KIAH',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_mmsd_klax',
    originCountryId: 'MX',
    destCountryId: 'US',
    originIcao: 'MMSD',
    destIcao: 'KLAX',
    capacityKgPerDay: 30_000,
  },
  // Sparse BR ↔ MX / BR ↔ CA
  {
    id: 'lane_sbgr_mmmx',
    originCountryId: 'BR',
    destCountryId: 'MX',
    originIcao: 'SBGR',
    destIcao: 'MMMX',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_sbgr_cyyz',
    originCountryId: 'BR',
    destCountryId: 'CA',
    originIcao: 'SBGR',
    destIcao: 'CYYZ',
    capacityKgPerDay: 35_000,
  },
  // BR ↔ Argentina / Chile
  {
    id: 'lane_sbgr_saez',
    originCountryId: 'BR',
    destCountryId: 'AR',
    originIcao: 'SBGR',
    destIcao: 'SAEZ',
    capacityKgPerDay: 80_000,
  },
  {
    id: 'lane_sbgl_saez',
    originCountryId: 'BR',
    destCountryId: 'AR',
    originIcao: 'SBGL',
    destIcao: 'SAEZ',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_sbpa_saez',
    originCountryId: 'BR',
    destCountryId: 'AR',
    originIcao: 'SBPA',
    destIcao: 'SAEZ',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_sbgr_sabe',
    originCountryId: 'BR',
    destCountryId: 'AR',
    originIcao: 'SBGR',
    destIcao: 'SABE',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_sbct_saez',
    originCountryId: 'BR',
    destCountryId: 'AR',
    originIcao: 'SBCT',
    destIcao: 'SAEZ',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_sbgr_scel',
    originCountryId: 'BR',
    destCountryId: 'CL',
    originIcao: 'SBGR',
    destIcao: 'SCEL',
    capacityKgPerDay: 60_000,
  },
  {
    id: 'lane_sbgl_scel',
    originCountryId: 'BR',
    destCountryId: 'CL',
    originIcao: 'SBGL',
    destIcao: 'SCEL',
    capacityKgPerDay: 40_000,
  },
  // Argentina ↔ Chile
  {
    id: 'lane_saez_scel',
    originCountryId: 'AR',
    destCountryId: 'CL',
    originIcao: 'SAEZ',
    destIcao: 'SCEL',
    capacityKgPerDay: 70_000,
  },
  {
    id: 'lane_same_scel',
    originCountryId: 'AR',
    destCountryId: 'CL',
    originIcao: 'SAME',
    destIcao: 'SCEL',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_sazs_scte',
    originCountryId: 'AR',
    destCountryId: 'CL',
    originIcao: 'SAZS',
    destIcao: 'SCTE',
    capacityKgPerDay: 25_000,
  },
  // Sparse Cone Sul ↔ US
  {
    id: 'lane_saez_kmia',
    originCountryId: 'AR',
    destCountryId: 'US',
    originIcao: 'SAEZ',
    destIcao: 'KMIA',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_scel_kmia',
    originCountryId: 'CL',
    destCountryId: 'US',
    originIcao: 'SCEL',
    destIcao: 'KMIA',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_scel_klax',
    originCountryId: 'CL',
    destCountryId: 'US',
    originIcao: 'SCEL',
    destIcao: 'KLAX',
    capacityKgPerDay: 40_000,
  },
  // Cone Sul — Uruguay / Paraguay
  {
    id: 'lane_sbpa_sumu',
    originCountryId: 'BR',
    destCountryId: 'UY',
    originIcao: 'SBPA',
    destIcao: 'SUMU',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_sbgr_sumu',
    originCountryId: 'BR',
    destCountryId: 'UY',
    originIcao: 'SBGR',
    destIcao: 'SUMU',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_saez_sumu',
    originCountryId: 'AR',
    destCountryId: 'UY',
    originIcao: 'SAEZ',
    destIcao: 'SUMU',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_sbgr_sgas',
    originCountryId: 'BR',
    destCountryId: 'PY',
    originIcao: 'SBGR',
    destIcao: 'SGAS',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_sbct_sgas',
    originCountryId: 'BR',
    destCountryId: 'PY',
    originIcao: 'SBCT',
    destIcao: 'SGAS',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_saez_sgas',
    originCountryId: 'AR',
    destCountryId: 'PY',
    originIcao: 'SAEZ',
    destIcao: 'SGAS',
    capacityKgPerDay: 45_000,
  },
  // Andes — Peru / Bolivia / Ecuador
  {
    id: 'lane_sbgr_spjc',
    originCountryId: 'BR',
    destCountryId: 'PE',
    originIcao: 'SBGR',
    destIcao: 'SPJC',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_scel_spjc',
    originCountryId: 'CL',
    destCountryId: 'PE',
    originIcao: 'SCEL',
    destIcao: 'SPJC',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_spjc_kmia',
    originCountryId: 'PE',
    destCountryId: 'US',
    originIcao: 'SPJC',
    destIcao: 'KMIA',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_sbgr_sllp',
    originCountryId: 'BR',
    destCountryId: 'BO',
    originIcao: 'SBGR',
    destIcao: 'SLLP',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_saez_slvr',
    originCountryId: 'AR',
    destCountryId: 'BO',
    originIcao: 'SAEZ',
    destIcao: 'SLVR',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_spjc_sllp',
    originCountryId: 'PE',
    destCountryId: 'BO',
    originIcao: 'SPJC',
    destIcao: 'SLLP',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_spjc_sequ',
    originCountryId: 'PE',
    destCountryId: 'EC',
    originIcao: 'SPJC',
    destIcao: 'SEQU',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_segu_kmia',
    originCountryId: 'EC',
    destCountryId: 'US',
    originIcao: 'SEGU',
    destIcao: 'KMIA',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_sbgr_segu',
    originCountryId: 'BR',
    destCountryId: 'EC',
    originIcao: 'SBGR',
    destIcao: 'SEGU',
    capacityKgPerDay: 35_000,
  },
  // Northern SA — Colombia / Venezuela
  {
    id: 'lane_sbgr_skbo',
    originCountryId: 'BR',
    destCountryId: 'CO',
    originIcao: 'SBGR',
    destIcao: 'SKBO',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_skbo_kmia',
    originCountryId: 'CO',
    destCountryId: 'US',
    originIcao: 'SKBO',
    destIcao: 'KMIA',
    capacityKgPerDay: 60_000,
  },
  {
    id: 'lane_skcg_kmia',
    originCountryId: 'CO',
    destCountryId: 'US',
    originIcao: 'SKCG',
    destIcao: 'KMIA',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_skbo_mmmx',
    originCountryId: 'CO',
    destCountryId: 'MX',
    originIcao: 'SKBO',
    destIcao: 'MMMX',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_skbo_sequ',
    originCountryId: 'CO',
    destCountryId: 'EC',
    originIcao: 'SKBO',
    destIcao: 'SEQU',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_skbo_spjc',
    originCountryId: 'CO',
    destCountryId: 'PE',
    originIcao: 'SKBO',
    destIcao: 'SPJC',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_skbo_svmi',
    originCountryId: 'CO',
    destCountryId: 'VE',
    originIcao: 'SKBO',
    destIcao: 'SVMI',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_svmi_kmia',
    originCountryId: 'VE',
    destCountryId: 'US',
    originIcao: 'SVMI',
    destIcao: 'KMIA',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_sbeg_svmi',
    originCountryId: 'BR',
    destCountryId: 'VE',
    originIcao: 'SBEG',
    destIcao: 'SVMI',
    capacityKgPerDay: 35_000,
  },
  // Guianas
  {
    id: 'lane_svmi_sycj',
    originCountryId: 'VE',
    destCountryId: 'GY',
    originIcao: 'SVMI',
    destIcao: 'SYCJ',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_sbbe_sycj',
    originCountryId: 'BR',
    destCountryId: 'GY',
    originIcao: 'SBBE',
    destIcao: 'SYCJ',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_sycj_smjp',
    originCountryId: 'GY',
    destCountryId: 'SR',
    originIcao: 'SYCJ',
    destIcao: 'SMJP',
    capacityKgPerDay: 25_000,
  },
  {
    id: 'lane_sbbe_smjp',
    originCountryId: 'BR',
    destCountryId: 'SR',
    originIcao: 'SBBE',
    destIcao: 'SMJP',
    capacityKgPerDay: 25_000,
  },
  {
    id: 'lane_smjp_soca',
    originCountryId: 'SR',
    destCountryId: 'GF',
    originIcao: 'SMJP',
    destIcao: 'SOCA',
    capacityKgPerDay: 20_000,
  },
  {
    id: 'lane_sbbe_soca',
    originCountryId: 'BR',
    destCountryId: 'GF',
    originIcao: 'SBBE',
    destIcao: 'SOCA',
    capacityKgPerDay: 20_000,
  },
  // Central America
  {
    id: 'lane_mpto_mroc',
    originCountryId: 'PA',
    destCountryId: 'CR',
    originIcao: 'MPTO',
    destIcao: 'MROC',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_mpto_skbo',
    originCountryId: 'PA',
    destCountryId: 'CO',
    originIcao: 'MPTO',
    destIcao: 'SKBO',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_mpto_kmia',
    originCountryId: 'PA',
    destCountryId: 'US',
    originIcao: 'MPTO',
    destIcao: 'KMIA',
    capacityKgPerDay: 70_000,
  },
  {
    id: 'lane_mpto_mmmx',
    originCountryId: 'PA',
    destCountryId: 'MX',
    originIcao: 'MPTO',
    destIcao: 'MMMX',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_sbgr_mpto',
    originCountryId: 'BR',
    destCountryId: 'PA',
    originIcao: 'SBGR',
    destIcao: 'MPTO',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_mroc_mnmg',
    originCountryId: 'CR',
    destCountryId: 'NI',
    originIcao: 'MROC',
    destIcao: 'MNMG',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_mroc_kmia',
    originCountryId: 'CR',
    destCountryId: 'US',
    originIcao: 'MROC',
    destIcao: 'KMIA',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_mroc_mmmx',
    originCountryId: 'CR',
    destCountryId: 'MX',
    originIcao: 'MROC',
    destIcao: 'MMMX',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_mnmg_mhtg',
    originCountryId: 'NI',
    destCountryId: 'HN',
    originIcao: 'MNMG',
    destIcao: 'MHTG',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_mhtg_mslp',
    originCountryId: 'HN',
    destCountryId: 'SV',
    originIcao: 'MHTG',
    destIcao: 'MSLP',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_mhlm_mggt',
    originCountryId: 'HN',
    destCountryId: 'GT',
    originIcao: 'MHLM',
    destIcao: 'MGGT',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_mslp_mggt',
    originCountryId: 'SV',
    destCountryId: 'GT',
    originIcao: 'MSLP',
    destIcao: 'MGGT',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_mggt_mmmx',
    originCountryId: 'GT',
    destCountryId: 'MX',
    originIcao: 'MGGT',
    destIcao: 'MMMX',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_mggt_mzbz',
    originCountryId: 'GT',
    destCountryId: 'BZ',
    originIcao: 'MGGT',
    destIcao: 'MZBZ',
    capacityKgPerDay: 25_000,
  },
  {
    id: 'lane_mzbz_mmun',
    originCountryId: 'BZ',
    destCountryId: 'MX',
    originIcao: 'MZBZ',
    destIcao: 'MMUN',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_mzbz_kmia',
    originCountryId: 'BZ',
    destCountryId: 'US',
    originIcao: 'MZBZ',
    destIcao: 'KMIA',
    capacityKgPerDay: 35_000,
  },
  // Caribbean — intl-first regional ring + continental gateways
  {
    id: 'lane_muha_kmia',
    originCountryId: 'CU',
    destCountryId: 'US',
    originIcao: 'MUHA',
    destIcao: 'KMIA',
    capacityKgPerDay: 60_000,
  },
  {
    id: 'lane_muha_mdsd',
    originCountryId: 'CU',
    destCountryId: 'DO',
    originIcao: 'MUHA',
    destIcao: 'MDSD',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_muha_mynn',
    originCountryId: 'CU',
    destCountryId: 'BS',
    originIcao: 'MUHA',
    destIcao: 'MYNN',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_mdsd_kmia',
    originCountryId: 'DO',
    destCountryId: 'US',
    originIcao: 'MDSD',
    destIcao: 'KMIA',
    capacityKgPerDay: 70_000,
  },
  {
    id: 'lane_mdsd_mtpp',
    originCountryId: 'DO',
    destCountryId: 'HT',
    originIcao: 'MDSD',
    destIcao: 'MTPP',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_mdsd_mkjp',
    originCountryId: 'DO',
    destCountryId: 'JM',
    originIcao: 'MDSD',
    destIcao: 'MKJP',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_mdsd_skcg',
    originCountryId: 'DO',
    destCountryId: 'CO',
    originIcao: 'MDSD',
    destIcao: 'SKCG',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_mtpp_kmia',
    originCountryId: 'HT',
    destCountryId: 'US',
    originIcao: 'MTPP',
    destIcao: 'KMIA',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_mkjp_kmia',
    originCountryId: 'JM',
    destCountryId: 'US',
    originIcao: 'MKJP',
    destIcao: 'KMIA',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_mkjp_ttpp',
    originCountryId: 'JM',
    destCountryId: 'TT',
    originIcao: 'MKJP',
    destIcao: 'TTPP',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_mynn_kmia',
    originCountryId: 'BS',
    destCountryId: 'US',
    originIcao: 'MYNN',
    destIcao: 'KMIA',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_mynn_mmun',
    originCountryId: 'BS',
    destCountryId: 'MX',
    originIcao: 'MYNN',
    destIcao: 'MMUN',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_ttpp_svmi',
    originCountryId: 'TT',
    destCountryId: 'VE',
    originIcao: 'TTPP',
    destIcao: 'SVMI',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_ttpp_tbpb',
    originCountryId: 'TT',
    destCountryId: 'BB',
    originIcao: 'TTPP',
    destIcao: 'TBPB',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_ttpp_tgpy',
    originCountryId: 'TT',
    destCountryId: 'GD',
    originIcao: 'TTPP',
    destIcao: 'TGPY',
    capacityKgPerDay: 25_000,
  },
  {
    id: 'lane_tbpb_tlpl',
    originCountryId: 'BB',
    destCountryId: 'LC',
    originIcao: 'TBPB',
    destIcao: 'TLPL',
    capacityKgPerDay: 25_000,
  },
  {
    id: 'lane_tlpl_tapa',
    originCountryId: 'LC',
    destCountryId: 'AG',
    originIcao: 'TLPL',
    destIcao: 'TAPA',
    capacityKgPerDay: 25_000,
  },
  {
    id: 'lane_tlpl_tgpy',
    originCountryId: 'LC',
    destCountryId: 'GD',
    originIcao: 'TLPL',
    destIcao: 'TGPY',
    capacityKgPerDay: 20_000,
  },
  {
    id: 'lane_tapa_kmia',
    originCountryId: 'AG',
    destCountryId: 'US',
    originIcao: 'TAPA',
    destIcao: 'KMIA',
    capacityKgPerDay: 30_000,
  },
  // Caribbean dependencies (GP / MQ / CW / SX / AW)
  {
    id: 'lane_tffr_tfff',
    originCountryId: 'GP',
    destCountryId: 'MQ',
    originIcao: 'TFFR',
    destIcao: 'TFFF',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_tffr_tapa',
    originCountryId: 'GP',
    destCountryId: 'AG',
    originIcao: 'TFFR',
    destIcao: 'TAPA',
    capacityKgPerDay: 25_000,
  },
  {
    id: 'lane_tffr_kmia',
    originCountryId: 'GP',
    destCountryId: 'US',
    originIcao: 'TFFR',
    destIcao: 'KMIA',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_tfff_tbpb',
    originCountryId: 'MQ',
    destCountryId: 'BB',
    originIcao: 'TFFF',
    destIcao: 'TBPB',
    capacityKgPerDay: 25_000,
  },
  {
    id: 'lane_tfff_kmia',
    originCountryId: 'MQ',
    destCountryId: 'US',
    originIcao: 'TFFF',
    destIcao: 'KMIA',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_tncc_ttpp',
    originCountryId: 'CW',
    destCountryId: 'TT',
    originIcao: 'TNCC',
    destIcao: 'TTPP',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_tncc_svmi',
    originCountryId: 'CW',
    destCountryId: 'VE',
    originIcao: 'TNCC',
    destIcao: 'SVMI',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_tncc_kmia',
    originCountryId: 'CW',
    destCountryId: 'US',
    originIcao: 'TNCC',
    destIcao: 'KMIA',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_tncm_tapa',
    originCountryId: 'SX',
    destCountryId: 'AG',
    originIcao: 'TNCM',
    destIcao: 'TAPA',
    capacityKgPerDay: 25_000,
  },
  {
    id: 'lane_tncm_tffr',
    originCountryId: 'SX',
    destCountryId: 'GP',
    originIcao: 'TNCM',
    destIcao: 'TFFR',
    capacityKgPerDay: 25_000,
  },
  {
    id: 'lane_tncm_kmia',
    originCountryId: 'SX',
    destCountryId: 'US',
    originIcao: 'TNCM',
    destIcao: 'KMIA',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_tnca_tncc',
    originCountryId: 'AW',
    destCountryId: 'CW',
    originIcao: 'TNCA',
    destIcao: 'TNCC',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_tnca_svmi',
    originCountryId: 'AW',
    destCountryId: 'VE',
    originIcao: 'TNCA',
    destIcao: 'SVMI',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_tnca_kmia',
    originCountryId: 'AW',
    destCountryId: 'US',
    originIcao: 'TNCA',
    destIcao: 'KMIA',
    capacityKgPerDay: 35_000,
  },
  // EU-1 Western core ring + Americas bridge
  {
    id: 'lane_lppt_lemd',
    originCountryId: 'PT',
    destCountryId: 'ES',
    originIcao: 'LPPT',
    destIcao: 'LEMD',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_lemd_lfpg',
    originCountryId: 'ES',
    destCountryId: 'FR',
    originIcao: 'LEMD',
    destIcao: 'LFPG',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_lebl_lfml',
    originCountryId: 'ES',
    destCountryId: 'FR',
    originIcao: 'LEBL',
    destIcao: 'LFML',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_lfpg_egll',
    originCountryId: 'FR',
    destCountryId: 'GB',
    originIcao: 'LFPG',
    destIcao: 'EGLL',
    capacityKgPerDay: 60_000,
  },
  {
    id: 'lane_lfpg_eddf',
    originCountryId: 'FR',
    destCountryId: 'DE',
    originIcao: 'LFPG',
    destIcao: 'EDDF',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_egll_eham',
    originCountryId: 'GB',
    destCountryId: 'NL',
    originIcao: 'EGLL',
    destIcao: 'EHAM',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_egll_eddf',
    originCountryId: 'GB',
    destCountryId: 'DE',
    originIcao: 'EGLL',
    destIcao: 'EDDF',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_eham_eddf',
    originCountryId: 'NL',
    destCountryId: 'DE',
    originIcao: 'EHAM',
    destIcao: 'EDDF',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_eham_ebbr',
    originCountryId: 'NL',
    destCountryId: 'BE',
    originIcao: 'EHAM',
    destIcao: 'EBBR',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_ebbr_eddf',
    originCountryId: 'BE',
    destCountryId: 'DE',
    originIcao: 'EBBR',
    destIcao: 'EDDF',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_eddf_lirf',
    originCountryId: 'DE',
    destCountryId: 'IT',
    originIcao: 'EDDF',
    destIcao: 'LIRF',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_limc_lfpg',
    originCountryId: 'IT',
    destCountryId: 'FR',
    originIcao: 'LIMC',
    destIcao: 'LFPG',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_lirf_lemd',
    originCountryId: 'IT',
    destCountryId: 'ES',
    originIcao: 'LIRF',
    destIcao: 'LEMD',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_lfml_lirf',
    originCountryId: 'FR',
    destCountryId: 'IT',
    originIcao: 'LFML',
    destIcao: 'LIRF',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_egcc_eddf',
    originCountryId: 'GB',
    destCountryId: 'DE',
    originIcao: 'EGCC',
    destIcao: 'EDDF',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_lppt_sbgr',
    originCountryId: 'PT',
    destCountryId: 'BR',
    originIcao: 'LPPT',
    destIcao: 'SBGR',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_lfpg_sbgr',
    originCountryId: 'FR',
    destCountryId: 'BR',
    originIcao: 'LFPG',
    destIcao: 'SBGR',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_lfpg_kmia',
    originCountryId: 'FR',
    destCountryId: 'US',
    originIcao: 'LFPG',
    destIcao: 'KMIA',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_egll_kewr',
    originCountryId: 'GB',
    destCountryId: 'US',
    originIcao: 'EGLL',
    destIcao: 'KEWR',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_egll_kmia',
    originCountryId: 'GB',
    destCountryId: 'US',
    originIcao: 'EGLL',
    destIcao: 'KMIA',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_eddf_kewr',
    originCountryId: 'DE',
    destCountryId: 'US',
    originIcao: 'EDDF',
    destIcao: 'KEWR',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_lemd_kmia',
    originCountryId: 'ES',
    destCountryId: 'US',
    originIcao: 'LEMD',
    destIcao: 'KMIA',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_lirf_kmia',
    originCountryId: 'IT',
    destCountryId: 'US',
    originIcao: 'LIRF',
    destIcao: 'KMIA',
    capacityKgPerDay: 40_000,
  },
  // EU-2 Nordics + Alps + IE
  {
    id: 'lane_ekch_essa',
    originCountryId: 'DK',
    destCountryId: 'SE',
    originIcao: 'EKCH',
    destIcao: 'ESSA',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_essa_efhk',
    originCountryId: 'SE',
    destCountryId: 'FI',
    originIcao: 'ESSA',
    destIcao: 'EFHK',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_efhk_engm',
    originCountryId: 'FI',
    destCountryId: 'NO',
    originIcao: 'EFHK',
    destIcao: 'ENGM',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_engm_ekch',
    originCountryId: 'NO',
    destCountryId: 'DK',
    originIcao: 'ENGM',
    destIcao: 'EKCH',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_lszh_loww',
    originCountryId: 'CH',
    destCountryId: 'AT',
    originIcao: 'LSZH',
    destIcao: 'LOWW',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_lszh_eddm',
    originCountryId: 'CH',
    destCountryId: 'DE',
    originIcao: 'LSZH',
    destIcao: 'EDDM',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_loww_eddf',
    originCountryId: 'AT',
    destCountryId: 'DE',
    originIcao: 'LOWW',
    destIcao: 'EDDF',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_lszh_limc',
    originCountryId: 'CH',
    destCountryId: 'IT',
    originIcao: 'LSZH',
    destIcao: 'LIMC',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_eidw_egll',
    originCountryId: 'IE',
    destCountryId: 'GB',
    originIcao: 'EIDW',
    destIcao: 'EGLL',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_eidw_eham',
    originCountryId: 'IE',
    destCountryId: 'NL',
    originIcao: 'EIDW',
    destIcao: 'EHAM',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_ekch_eddf',
    originCountryId: 'DK',
    destCountryId: 'DE',
    originIcao: 'EKCH',
    destIcao: 'EDDF',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_essa_eddf',
    originCountryId: 'SE',
    destCountryId: 'DE',
    originIcao: 'ESSA',
    destIcao: 'EDDF',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_engm_eham',
    originCountryId: 'NO',
    destCountryId: 'NL',
    originIcao: 'ENGM',
    destIcao: 'EHAM',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_efhk_eddf',
    originCountryId: 'FI',
    destCountryId: 'DE',
    originIcao: 'EFHK',
    destIcao: 'EDDF',
    capacityKgPerDay: 40_000,
  },
  // EU-3 Central-East + Baltics
  {
    id: 'lane_epwa_lkpr',
    originCountryId: 'PL',
    destCountryId: 'CZ',
    originIcao: 'EPWA',
    destIcao: 'LKPR',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_lkpr_lzib',
    originCountryId: 'CZ',
    destCountryId: 'SK',
    originIcao: 'LKPR',
    destIcao: 'LZIB',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_lzib_lhbp',
    originCountryId: 'SK',
    destCountryId: 'HU',
    originIcao: 'LZIB',
    destIcao: 'LHBP',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_lhbp_epwa',
    originCountryId: 'HU',
    destCountryId: 'PL',
    originIcao: 'LHBP',
    destIcao: 'EPWA',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_lkpr_lhbp',
    originCountryId: 'CZ',
    destCountryId: 'HU',
    originIcao: 'LKPR',
    destIcao: 'LHBP',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_eetn_evra',
    originCountryId: 'EE',
    destCountryId: 'LV',
    originIcao: 'EETN',
    destIcao: 'EVRA',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_evra_eyvi',
    originCountryId: 'LV',
    destCountryId: 'LT',
    originIcao: 'EVRA',
    destIcao: 'EYVI',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_eyvi_eetn',
    originCountryId: 'LT',
    destCountryId: 'EE',
    originIcao: 'EYVI',
    destIcao: 'EETN',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_epwa_eddf',
    originCountryId: 'PL',
    destCountryId: 'DE',
    originIcao: 'EPWA',
    destIcao: 'EDDF',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_lkpr_eddf',
    originCountryId: 'CZ',
    destCountryId: 'DE',
    originIcao: 'LKPR',
    destIcao: 'EDDF',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_lhbp_loww',
    originCountryId: 'HU',
    destCountryId: 'AT',
    originIcao: 'LHBP',
    destIcao: 'LOWW',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_lzib_loww',
    originCountryId: 'SK',
    destCountryId: 'AT',
    originIcao: 'LZIB',
    destIcao: 'LOWW',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_eetn_efhk',
    originCountryId: 'EE',
    destCountryId: 'FI',
    originIcao: 'EETN',
    destIcao: 'EFHK',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_evra_essa',
    originCountryId: 'LV',
    destCountryId: 'SE',
    originIcao: 'EVRA',
    destIcao: 'ESSA',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_eyvi_essa',
    originCountryId: 'LT',
    destCountryId: 'SE',
    originIcao: 'EYVI',
    destIcao: 'ESSA',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_epgd_eddh',
    originCountryId: 'PL',
    destCountryId: 'DE',
    originIcao: 'EPGD',
    destIcao: 'EDDH',
    capacityKgPerDay: 40_000,
  },
  // EU-4 Balkans
  {
    id: 'lane_ldza_ljlj',
    originCountryId: 'HR',
    destCountryId: 'SI',
    originIcao: 'LDZA',
    destIcao: 'LJLJ',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_ldza_lybe',
    originCountryId: 'HR',
    destCountryId: 'RS',
    originIcao: 'LDZA',
    destIcao: 'LYBE',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_lybe_lrop',
    originCountryId: 'RS',
    destCountryId: 'RO',
    originIcao: 'LYBE',
    destIcao: 'LROP',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_lrop_lbsf',
    originCountryId: 'RO',
    destCountryId: 'BG',
    originIcao: 'LROP',
    destIcao: 'LBSF',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_lbsf_lgav',
    originCountryId: 'BG',
    destCountryId: 'GR',
    originIcao: 'LBSF',
    destIcao: 'LGAV',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_ldza_loww',
    originCountryId: 'HR',
    destCountryId: 'AT',
    originIcao: 'LDZA',
    destIcao: 'LOWW',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_ljlj_loww',
    originCountryId: 'SI',
    destCountryId: 'AT',
    originIcao: 'LJLJ',
    destIcao: 'LOWW',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_lrop_lhbp',
    originCountryId: 'RO',
    destCountryId: 'HU',
    originIcao: 'LROP',
    destIcao: 'LHBP',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_lybe_lhbp',
    originCountryId: 'RS',
    destCountryId: 'HU',
    originIcao: 'LYBE',
    destIcao: 'LHBP',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_lgav_lirf',
    originCountryId: 'GR',
    destCountryId: 'IT',
    originIcao: 'LGAV',
    destIcao: 'LIRF',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_lgav_eddf',
    originCountryId: 'GR',
    destCountryId: 'DE',
    originIcao: 'LGAV',
    destIcao: 'EDDF',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_ldsp_limc',
    originCountryId: 'HR',
    destCountryId: 'IT',
    originIcao: 'LDSP',
    destIcao: 'LIMC',
    capacityKgPerDay: 35_000,
  },
  // EU-5 Iceland gateways
  {
    id: 'lane_bikf_egll',
    originCountryId: 'IS',
    destCountryId: 'GB',
    originIcao: 'BIKF',
    destIcao: 'EGLL',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_bikf_eidw',
    originCountryId: 'IS',
    destCountryId: 'IE',
    originIcao: 'BIKF',
    destIcao: 'EIDW',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_bikf_engm',
    originCountryId: 'IS',
    destCountryId: 'NO',
    originIcao: 'BIKF',
    destIcao: 'ENGM',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_bikf_ekch',
    originCountryId: 'IS',
    destCountryId: 'DK',
    originIcao: 'BIKF',
    destIcao: 'EKCH',
    capacityKgPerDay: 40_000,
  },
  // EU-6 W. Balkans
  {
    id: 'lane_lqsa_lybe',
    originCountryId: 'BA',
    destCountryId: 'RS',
    originIcao: 'LQSA',
    destIcao: 'LYBE',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_lqsa_ldza',
    originCountryId: 'BA',
    destCountryId: 'HR',
    originIcao: 'LQSA',
    destIcao: 'LDZA',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_lypg_lybe',
    originCountryId: 'ME',
    destCountryId: 'RS',
    originIcao: 'LYPG',
    destIcao: 'LYBE',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_lypg_ldsp',
    originCountryId: 'ME',
    destCountryId: 'HR',
    originIcao: 'LYPG',
    destIcao: 'LDSP',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_lati_lgav',
    originCountryId: 'AL',
    destCountryId: 'GR',
    originIcao: 'LATI',
    destIcao: 'LGAV',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_lati_lwsk',
    originCountryId: 'AL',
    destCountryId: 'MK',
    originIcao: 'LATI',
    destIcao: 'LWSK',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_lwsk_lybe',
    originCountryId: 'MK',
    destCountryId: 'RS',
    originIcao: 'LWSK',
    destIcao: 'LYBE',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_lwsk_lbsf',
    originCountryId: 'MK',
    destCountryId: 'BG',
    originIcao: 'LWSK',
    destIcao: 'LBSF',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_lqsa_loww',
    originCountryId: 'BA',
    destCountryId: 'AT',
    originIcao: 'LQSA',
    destIcao: 'LOWW',
    capacityKgPerDay: 35_000,
  },
  // EU-7 East
  {
    id: 'lane_ltfm_lgav',
    originCountryId: 'TR',
    destCountryId: 'GR',
    originIcao: 'LTFM',
    destIcao: 'LGAV',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_ltfm_lrop',
    originCountryId: 'TR',
    destCountryId: 'RO',
    originIcao: 'LTFM',
    destIcao: 'LROP',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_ltfm_eddf',
    originCountryId: 'TR',
    destCountryId: 'DE',
    originIcao: 'LTFM',
    destIcao: 'EDDF',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_ltac_lhbp',
    originCountryId: 'TR',
    destCountryId: 'HU',
    originIcao: 'LTAC',
    destIcao: 'LHBP',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_ltfm_lbsf',
    originCountryId: 'TR',
    destCountryId: 'BG',
    originIcao: 'LTFM',
    destIcao: 'LBSF',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_ukbb_epwa',
    originCountryId: 'UA',
    destCountryId: 'PL',
    originIcao: 'UKBB',
    destIcao: 'EPWA',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_ukbb_lrop',
    originCountryId: 'UA',
    destCountryId: 'RO',
    originIcao: 'UKBB',
    destIcao: 'LROP',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_ukbb_lhbp',
    originCountryId: 'UA',
    destCountryId: 'HU',
    originIcao: 'UKBB',
    destIcao: 'LHBP',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_ukll_epwa',
    originCountryId: 'UA',
    destCountryId: 'PL',
    originIcao: 'UKLL',
    destIcao: 'EPWA',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_ukoo_lrop',
    originCountryId: 'UA',
    destCountryId: 'RO',
    originIcao: 'UKOO',
    destIcao: 'LROP',
    capacityKgPerDay: 35_000,
  },
  // EU-8 Europe gaps
  {
    id: 'lane_umms_epwa',
    originCountryId: 'BY',
    destCountryId: 'PL',
    originIcao: 'UMMS',
    destIcao: 'EPWA',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_umms_ukbb',
    originCountryId: 'BY',
    destCountryId: 'UA',
    originIcao: 'UMMS',
    destIcao: 'UKBB',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_umms_eyvi',
    originCountryId: 'BY',
    destCountryId: 'LT',
    originIcao: 'UMMS',
    destIcao: 'EYVI',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_lukk_lrop',
    originCountryId: 'MD',
    destCountryId: 'RO',
    originIcao: 'LUKK',
    destIcao: 'LROP',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_lukk_ukbb',
    originCountryId: 'MD',
    destCountryId: 'UA',
    originIcao: 'LUKK',
    destIcao: 'UKBB',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_ugtb_ltfm',
    originCountryId: 'GE',
    destCountryId: 'TR',
    originIcao: 'UGTB',
    destIcao: 'LTFM',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_ugtb_udyz',
    originCountryId: 'GE',
    destCountryId: 'AM',
    originIcao: 'UGTB',
    destIcao: 'UDYZ',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_ugtb_ubbb',
    originCountryId: 'GE',
    destCountryId: 'AZ',
    originIcao: 'UGTB',
    destIcao: 'UBBB',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_udyz_ltfm',
    originCountryId: 'AM',
    destCountryId: 'TR',
    originIcao: 'UDYZ',
    destIcao: 'LTFM',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_ubbb_ltfm',
    originCountryId: 'AZ',
    destCountryId: 'TR',
    originIcao: 'UBBB',
    destIcao: 'LTFM',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_ellx_ebbr',
    originCountryId: 'LU',
    destCountryId: 'BE',
    originIcao: 'ELLX',
    destIcao: 'EBBR',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_ellx_eddf',
    originCountryId: 'LU',
    destCountryId: 'DE',
    originIcao: 'ELLX',
    destIcao: 'EDDF',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_lmml_limc',
    originCountryId: 'MT',
    destCountryId: 'IT',
    originIcao: 'LMML',
    destIcao: 'LIMC',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_lmml_lgav',
    originCountryId: 'MT',
    destCountryId: 'GR',
    originIcao: 'LMML',
    destIcao: 'LGAV',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_lclk_lgav',
    originCountryId: 'CY',
    destCountryId: 'GR',
    originIcao: 'LCLK',
    destIcao: 'LGAV',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_lclk_ltfm',
    originCountryId: 'CY',
    destCountryId: 'TR',
    originIcao: 'LCLK',
    destIcao: 'LTFM',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_bkpr_lybe',
    originCountryId: 'XK',
    destCountryId: 'RS',
    originIcao: 'BKPR',
    destIcao: 'LYBE',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_bkpr_lati',
    originCountryId: 'XK',
    destCountryId: 'AL',
    originIcao: 'BKPR',
    destIcao: 'LATI',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_gmmn_lemd',
    originCountryId: 'MA',
    destCountryId: 'ES',
    originIcao: 'GMMN',
    destIcao: 'LEMD',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_gmmn_lppt',
    originCountryId: 'MA',
    destCountryId: 'PT',
    originIcao: 'GMMN',
    destIcao: 'LPPT',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_gmtt_lebl',
    originCountryId: 'MA',
    destCountryId: 'ES',
    originIcao: 'GMTT',
    destIcao: 'LEBL',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_daag_lfml',
    originCountryId: 'DZ',
    destCountryId: 'FR',
    originIcao: 'DAAG',
    destIcao: 'LFML',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_daag_lemd',
    originCountryId: 'DZ',
    destCountryId: 'ES',
    originIcao: 'DAAG',
    destIcao: 'LEMD',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_dtta_lirf',
    originCountryId: 'TN',
    destCountryId: 'IT',
    originIcao: 'DTTA',
    destIcao: 'LIRF',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_dtta_lmml',
    originCountryId: 'TN',
    destCountryId: 'MT',
    originIcao: 'DTTA',
    destIcao: 'LMML',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_heca_lgav',
    originCountryId: 'EG',
    destCountryId: 'GR',
    originIcao: 'HECA',
    destIcao: 'LGAV',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_heca_ltfm',
    originCountryId: 'EG',
    destCountryId: 'TR',
    originIcao: 'HECA',
    destIcao: 'LTFM',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_heca_lclk',
    originCountryId: 'EG',
    destCountryId: 'CY',
    originIcao: 'HECA',
    destIcao: 'LCLK',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_heca_llbg',
    originCountryId: 'EG',
    destCountryId: 'IL',
    originIcao: 'HECA',
    destIcao: 'LLBG',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_llbg_lclk',
    originCountryId: 'IL',
    destCountryId: 'CY',
    originIcao: 'LLBG',
    destIcao: 'LCLK',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_llbg_lgav',
    originCountryId: 'IL',
    destCountryId: 'GR',
    originIcao: 'LLBG',
    destIcao: 'LGAV',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_gmmn_daag',
    originCountryId: 'MA',
    destCountryId: 'DZ',
    originIcao: 'GMMN',
    destIcao: 'DAAG',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_daag_dtta',
    originCountryId: 'DZ',
    destCountryId: 'TN',
    originIcao: 'DAAG',
    destIcao: 'DTTA',
    capacityKgPerDay: 35_000,
  },
  // MENA-2 Gulf ring + bridges
  {
    id: 'lane_oejn_omdb',
    originCountryId: 'SA',
    destCountryId: 'AE',
    originIcao: 'OEJN',
    destIcao: 'OMDB',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_oerk_omdb',
    originCountryId: 'SA',
    destCountryId: 'AE',
    originIcao: 'OERK',
    destIcao: 'OMDB',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_oedf_omdb',
    originCountryId: 'SA',
    destCountryId: 'AE',
    originIcao: 'OEDF',
    destIcao: 'OMDB',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_oedf_okkk',
    originCountryId: 'SA',
    destCountryId: 'KW',
    originIcao: 'OEDF',
    destIcao: 'OKKK',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_omdb_othh',
    originCountryId: 'AE',
    destCountryId: 'QA',
    originIcao: 'OMDB',
    destIcao: 'OTHH',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_omdb_obbi',
    originCountryId: 'AE',
    destCountryId: 'BH',
    originIcao: 'OMDB',
    destIcao: 'OBBI',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_omaa_ooms',
    originCountryId: 'AE',
    destCountryId: 'OM',
    originIcao: 'OMAA',
    destIcao: 'OOMS',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_othh_obbi',
    originCountryId: 'QA',
    destCountryId: 'BH',
    originIcao: 'OTHH',
    destIcao: 'OBBI',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_obbi_okkk',
    originCountryId: 'BH',
    destCountryId: 'KW',
    originIcao: 'OBBI',
    destIcao: 'OKKK',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_omdb_ooms',
    originCountryId: 'AE',
    destCountryId: 'OM',
    originIcao: 'OMDB',
    destIcao: 'OOMS',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_heca_oejn',
    originCountryId: 'EG',
    destCountryId: 'SA',
    originIcao: 'HECA',
    destIcao: 'OEJN',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_heca_omdb',
    originCountryId: 'EG',
    destCountryId: 'AE',
    originIcao: 'HECA',
    destIcao: 'OMDB',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_llbg_omdb',
    originCountryId: 'IL',
    destCountryId: 'AE',
    originIcao: 'LLBG',
    destIcao: 'OMDB',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_ltfm_omdb',
    originCountryId: 'TR',
    destCountryId: 'AE',
    originIcao: 'LTFM',
    destIcao: 'OMDB',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_ltfm_othh',
    originCountryId: 'TR',
    destCountryId: 'QA',
    originIcao: 'LTFM',
    destIcao: 'OTHH',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_lclk_omdb',
    originCountryId: 'CY',
    destCountryId: 'AE',
    originIcao: 'LCLK',
    destIcao: 'OMDB',
    capacityKgPerDay: 30_000,
  },
  // MENA-3 North Gulf
  {
    id: 'lane_orbi_okkk',
    originCountryId: 'IQ',
    destCountryId: 'KW',
    originIcao: 'ORBI',
    destIcao: 'OKKK',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_ormm_oedf',
    originCountryId: 'IQ',
    destCountryId: 'SA',
    originIcao: 'ORMM',
    destIcao: 'OEDF',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_ormm_okkk',
    originCountryId: 'IQ',
    destCountryId: 'KW',
    originIcao: 'ORMM',
    destIcao: 'OKKK',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_orbi_othh',
    originCountryId: 'IQ',
    destCountryId: 'QA',
    originIcao: 'ORBI',
    destIcao: 'OTHH',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_orbi_omdb',
    originCountryId: 'IQ',
    destCountryId: 'AE',
    originIcao: 'ORBI',
    destIcao: 'OMDB',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_oiie_omdb',
    originCountryId: 'IR',
    destCountryId: 'AE',
    originIcao: 'OIIE',
    destIcao: 'OMDB',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_oiie_othh',
    originCountryId: 'IR',
    destCountryId: 'QA',
    originIcao: 'OIIE',
    destIcao: 'OTHH',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_oiss_ooms',
    originCountryId: 'IR',
    destCountryId: 'OM',
    originIcao: 'OISS',
    destIcao: 'OOMS',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_orbi_oiie',
    originCountryId: 'IQ',
    destCountryId: 'IR',
    originIcao: 'ORBI',
    destIcao: 'OIIE',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_ltfm_oiie',
    originCountryId: 'TR',
    destCountryId: 'IR',
    originIcao: 'LTFM',
    destIcao: 'OIIE',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_ltfm_orbi',
    originCountryId: 'TR',
    destCountryId: 'IQ',
    originIcao: 'LTFM',
    destIcao: 'ORBI',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_heca_orbi',
    originCountryId: 'EG',
    destCountryId: 'IQ',
    originIcao: 'HECA',
    destIcao: 'ORBI',
    capacityKgPerDay: 35_000,
  },
  // MENA-4 Levant-east
  {
    id: 'lane_ojai_llbg',
    originCountryId: 'JO',
    destCountryId: 'IL',
    originIcao: 'OJAI',
    destIcao: 'LLBG',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_ojai_ltfm',
    originCountryId: 'JO',
    destCountryId: 'TR',
    originIcao: 'OJAI',
    destIcao: 'LTFM',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_ojai_oejn',
    originCountryId: 'JO',
    destCountryId: 'SA',
    originIcao: 'OJAI',
    destIcao: 'OEJN',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_ojai_orbi',
    originCountryId: 'JO',
    destCountryId: 'IQ',
    originIcao: 'OJAI',
    destIcao: 'ORBI',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_ojaq_oejn',
    originCountryId: 'JO',
    destCountryId: 'SA',
    originIcao: 'OJAQ',
    destIcao: 'OEJN',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_olba_llbg',
    originCountryId: 'LB',
    destCountryId: 'IL',
    originIcao: 'OLBA',
    destIcao: 'LLBG',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_olba_ltfm',
    originCountryId: 'LB',
    destCountryId: 'TR',
    originIcao: 'OLBA',
    destIcao: 'LTFM',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_olba_lgav',
    originCountryId: 'LB',
    destCountryId: 'GR',
    originIcao: 'OLBA',
    destIcao: 'LGAV',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_olba_heca',
    originCountryId: 'LB',
    destCountryId: 'EG',
    originIcao: 'OLBA',
    destIcao: 'HECA',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_osdi_ltfm',
    originCountryId: 'SY',
    destCountryId: 'TR',
    originIcao: 'OSDI',
    destIcao: 'LTFM',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_osdi_orbi',
    originCountryId: 'SY',
    destCountryId: 'IQ',
    originIcao: 'OSDI',
    destIcao: 'ORBI',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_osdi_ojai',
    originCountryId: 'SY',
    destCountryId: 'JO',
    originIcao: 'OSDI',
    destIcao: 'OJAI',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_oslk_lclk',
    originCountryId: 'SY',
    destCountryId: 'CY',
    originIcao: 'OSLK',
    destIcao: 'LCLK',
    capacityKgPerDay: 25_000,
  },
  // MENA-5 Maghreb/Nile gap
  {
    id: 'lane_hllm_dtta',
    originCountryId: 'LY',
    destCountryId: 'TN',
    originIcao: 'HLLM',
    destIcao: 'DTTA',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_hllm_heca',
    originCountryId: 'LY',
    destCountryId: 'EG',
    originIcao: 'HLLM',
    destIcao: 'HECA',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_hllm_lmml',
    originCountryId: 'LY',
    destCountryId: 'MT',
    originIcao: 'HLLM',
    destIcao: 'LMML',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_hllb_heca',
    originCountryId: 'LY',
    destCountryId: 'EG',
    originIcao: 'HLLB',
    destIcao: 'HECA',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_hllb_ltfm',
    originCountryId: 'LY',
    destCountryId: 'TR',
    originIcao: 'HLLB',
    destIcao: 'LTFM',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_hssk_heca',
    originCountryId: 'SD',
    destCountryId: 'EG',
    originIcao: 'HSSK',
    destIcao: 'HECA',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_hssk_oejn',
    originCountryId: 'SD',
    destCountryId: 'SA',
    originIcao: 'HSSK',
    destIcao: 'OEJN',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_hssk_hllm',
    originCountryId: 'SD',
    destCountryId: 'LY',
    originIcao: 'HSSK',
    destIcao: 'HLLM',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_hspn_oejn',
    originCountryId: 'SD',
    destCountryId: 'SA',
    originIcao: 'HSPN',
    destIcao: 'OEJN',
    capacityKgPerDay: 35_000,
  },
  // MENA-6 Yemen
  {
    id: 'lane_oysn_oejn',
    originCountryId: 'YE',
    destCountryId: 'SA',
    originIcao: 'OYSN',
    destIcao: 'OEJN',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_oyaa_oejn',
    originCountryId: 'YE',
    destCountryId: 'SA',
    originIcao: 'OYAA',
    destIcao: 'OEJN',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_oyaa_ooms',
    originCountryId: 'YE',
    destCountryId: 'OM',
    originIcao: 'OYAA',
    destIcao: 'OOMS',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_oysn_omdb',
    originCountryId: 'YE',
    destCountryId: 'AE',
    originIcao: 'OYSN',
    destIcao: 'OMDB',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_oysn_hssk',
    originCountryId: 'YE',
    destCountryId: 'SD',
    originIcao: 'OYSN',
    destIcao: 'HSSK',
    capacityKgPerDay: 30_000,
  },
  // Asia-1 Pakistan
  {
    id: 'lane_opkc_omdb',
    originCountryId: 'PK',
    destCountryId: 'AE',
    originIcao: 'OPKC',
    destIcao: 'OMDB',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_opkc_ooms',
    originCountryId: 'PK',
    destCountryId: 'OM',
    originIcao: 'OPKC',
    destIcao: 'OOMS',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_opis_oiie',
    originCountryId: 'PK',
    destCountryId: 'IR',
    originIcao: 'OPIS',
    destIcao: 'OIIE',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_opqt_oikb',
    originCountryId: 'PK',
    destCountryId: 'IR',
    originIcao: 'OPQT',
    destIcao: 'OIKB',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_opkc_oejn',
    originCountryId: 'PK',
    destCountryId: 'SA',
    originIcao: 'OPKC',
    destIcao: 'OEJN',
    capacityKgPerDay: 40_000,
  },
  // Asia-2 India west
  {
    id: 'lane_vidp_opis',
    originCountryId: 'IN',
    destCountryId: 'PK',
    originIcao: 'VIDP',
    destIcao: 'OPIS',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_viar_opla',
    originCountryId: 'IN',
    destCountryId: 'PK',
    originIcao: 'VIAR',
    destIcao: 'OPLA',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_vabb_opkc',
    originCountryId: 'IN',
    destCountryId: 'PK',
    originIcao: 'VABB',
    destIcao: 'OPKC',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_vabb_omdb',
    originCountryId: 'IN',
    destCountryId: 'AE',
    originIcao: 'VABB',
    destIcao: 'OMDB',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_vabb_oejn',
    originCountryId: 'IN',
    destCountryId: 'SA',
    originIcao: 'VABB',
    destIcao: 'OEJN',
    capacityKgPerDay: 40_000,
  },
  // Asia-3 India south / east
  {
    id: 'lane_vomm_omdb',
    originCountryId: 'IN',
    destCountryId: 'AE',
    originIcao: 'VOMM',
    destIcao: 'OMDB',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_vobl_oejn',
    originCountryId: 'IN',
    destCountryId: 'SA',
    originIcao: 'VOBL',
    destIcao: 'OEJN',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_voci_ooms',
    originCountryId: 'IN',
    destCountryId: 'OM',
    originIcao: 'VOCI',
    destIcao: 'OOMS',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_vecc_omdb',
    originCountryId: 'IN',
    destCountryId: 'AE',
    originIcao: 'VECC',
    destIcao: 'OMDB',
    capacityKgPerDay: 40_000,
  },
  // Asia-4 Sri Lanka
  {
    id: 'lane_vcbi_vomm',
    originCountryId: 'LK',
    destCountryId: 'IN',
    originIcao: 'VCBI',
    destIcao: 'VOMM',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_vcbi_voci',
    originCountryId: 'LK',
    destCountryId: 'IN',
    originIcao: 'VCBI',
    destIcao: 'VOCI',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_vcbi_vabb',
    originCountryId: 'LK',
    destCountryId: 'IN',
    originIcao: 'VCBI',
    destIcao: 'VABB',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_vcbi_omdb',
    originCountryId: 'LK',
    destCountryId: 'AE',
    originIcao: 'VCBI',
    destIcao: 'OMDB',
    capacityKgPerDay: 40_000,
  },
  // Asia-5 Central Asia
  {
    id: 'lane_uaaa_uttt',
    originCountryId: 'KZ',
    destCountryId: 'UZ',
    originIcao: 'UAAA',
    destIcao: 'UTTT',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_uaii_uttt',
    originCountryId: 'KZ',
    destCountryId: 'UZ',
    originIcao: 'UAII',
    destIcao: 'UTTT',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_utaa_uttt',
    originCountryId: 'TM',
    destCountryId: 'UZ',
    originIcao: 'UTAA',
    destIcao: 'UTTT',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_utaa_oiie',
    originCountryId: 'TM',
    destCountryId: 'IR',
    originIcao: 'UTAA',
    destIcao: 'OIIE',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_uttt_oiie',
    originCountryId: 'UZ',
    destCountryId: 'IR',
    originIcao: 'UTTT',
    destIcao: 'OIIE',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_uate_ubbb',
    originCountryId: 'KZ',
    destCountryId: 'AZ',
    originIcao: 'UATE',
    destIcao: 'UBBB',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_utak_ubbb',
    originCountryId: 'TM',
    destCountryId: 'AZ',
    originIcao: 'UTAK',
    destIcao: 'UBBB',
    capacityKgPerDay: 35_000,
  },
  // Asia-6 Tajikistan / Kyrgyzstan
  {
    id: 'lane_utdd_uttt',
    originCountryId: 'TJ',
    destCountryId: 'UZ',
    originIcao: 'UTDD',
    destIcao: 'UTTT',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_utdl_uttt',
    originCountryId: 'TJ',
    destCountryId: 'UZ',
    originIcao: 'UTDL',
    destIcao: 'UTTT',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_ucfm_uaaa',
    originCountryId: 'KG',
    destCountryId: 'KZ',
    originIcao: 'UCFM',
    destIcao: 'UAAA',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_ucfo_uttt',
    originCountryId: 'KG',
    destCountryId: 'UZ',
    originIcao: 'UCFO',
    destIcao: 'UTTT',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_utdd_ucfm',
    originCountryId: 'TJ',
    destCountryId: 'KG',
    originIcao: 'UTDD',
    destIcao: 'UCFM',
    capacityKgPerDay: 30_000,
  },
  // Asia-7 Afghanistan
  {
    id: 'lane_oakb_opis',
    originCountryId: 'AF',
    destCountryId: 'PK',
    originIcao: 'OAKB',
    destIcao: 'OPIS',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_oakn_opqt',
    originCountryId: 'AF',
    destCountryId: 'PK',
    originIcao: 'OAKN',
    destIcao: 'OPQT',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_oahr_oiie',
    originCountryId: 'AF',
    destCountryId: 'IR',
    originIcao: 'OAHR',
    destIcao: 'OIIE',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_oams_uttt',
    originCountryId: 'AF',
    destCountryId: 'UZ',
    originIcao: 'OAMS',
    destIcao: 'UTTT',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_oakb_utdd',
    originCountryId: 'AF',
    destCountryId: 'TJ',
    originIcao: 'OAKB',
    destIcao: 'UTDD',
    capacityKgPerDay: 30_000,
  },
  // Asia-8 Nepal / Bangladesh
  {
    id: 'lane_vnkt_vidp',
    originCountryId: 'NP',
    destCountryId: 'IN',
    originIcao: 'VNKT',
    destIcao: 'VIDP',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_vghs_vecc',
    originCountryId: 'BD',
    destCountryId: 'IN',
    originIcao: 'VGHS',
    destIcao: 'VECC',
    capacityKgPerDay: 45_000,
  },
  {
    id: 'lane_vghs_vnkt',
    originCountryId: 'BD',
    destCountryId: 'NP',
    originIcao: 'VGHS',
    destIcao: 'VNKT',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_vghs_vegt',
    originCountryId: 'BD',
    destCountryId: 'IN',
    originIcao: 'VGHS',
    destIcao: 'VEGT',
    capacityKgPerDay: 30_000,
  },
  // Asia-9 Bhutan / Myanmar
  {
    id: 'lane_vqpr_vidp',
    originCountryId: 'BT',
    destCountryId: 'IN',
    originIcao: 'VQPR',
    destIcao: 'VIDP',
    capacityKgPerDay: 30_000,
  },
  {
    id: 'lane_vqpr_vnkt',
    originCountryId: 'BT',
    destCountryId: 'NP',
    originIcao: 'VQPR',
    destIcao: 'VNKT',
    capacityKgPerDay: 25_000,
  },
  {
    id: 'lane_vyyy_vghs',
    originCountryId: 'MM',
    destCountryId: 'BD',
    originIcao: 'VYYY',
    destIcao: 'VGHS',
    capacityKgPerDay: 35_000,
  },
  {
    id: 'lane_vysw_vgeg',
    originCountryId: 'MM',
    destCountryId: 'BD',
    originIcao: 'VYSW',
    destIcao: 'VGEG',
    capacityKgPerDay: 25_000,
  },
  {
    id: 'lane_vyyy_vecc',
    originCountryId: 'MM',
    destCountryId: 'IN',
    originIcao: 'VYYY',
    destIcao: 'VECC',
    capacityKgPerDay: 35_000,
  },
];

/** Merge curated international lanes into a world (idempotent by id / OD). */
export function ensureInternationalLanes(world: CareerEconomyWorld): boolean {
  const existing = world.internationalLanes ?? [];
  const byId = new Map(existing.map((l) => [l.id, l]));
  const byOd = new Set(
    existing.map(
      (l) =>
        `${l.originIcao.toUpperCase()}:${l.destIcao.toUpperCase()}`,
    ),
  );
  let added = false;
  for (const lane of CAREER_INTERNATIONAL_LANES) {
    if (byId.has(lane.id)) continue;
    const od = `${lane.originIcao.toUpperCase()}:${lane.destIcao.toUpperCase()}`;
    const odRev = `${lane.destIcao.toUpperCase()}:${lane.originIcao.toUpperCase()}`;
    if (byOd.has(od) || byOd.has(odRev)) continue;
    existing.push({ ...lane });
    byId.set(lane.id, lane);
    byOd.add(od);
    added = true;
  }
  world.internationalLanes = existing;
  return added;
}

const CORRIDOR_WEIGHT_BY_OD: ReadonlyMap<string, number> = (() => {
  const map = new Map<string, number>();
  for (const { a, b, weight } of CAREER_CARGO_CORRIDORS) {
    const left = a.toUpperCase();
    const right = b.toUpperCase();
    map.set(`${left}:${right}`, weight);
    map.set(`${right}:${left}`, weight);
  }
  return map;
})();

const CORRIDOR_PARTNERS_BY_ICAO: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const { a, b } of CAREER_CARGO_CORRIDORS) {
    const left = a.toUpperCase();
    const right = b.toUpperCase();
    if (!map.has(left)) map.set(left, []);
    if (!map.has(right)) map.set(right, []);
    map.get(left)!.push(right);
    map.get(right)!.push(left);
  }
  return map;
})();

/** 1 = off-corridor; >1 = curated domestic cargo axis. */
export function corridorWeight(originIcao: string, destIcao: string): number {
  return (
    CORRIDOR_WEIGHT_BY_OD.get(
      `${originIcao.toUpperCase()}:${destIcao.toUpperCase()}`,
    ) ?? 1
  );
}

export function corridorPartners(icao: string): readonly string[] {
  return CORRIDOR_PARTNERS_BY_ICAO.get(icao.toUpperCase()) ?? [];
}

export const CAREER_COMMODITIES: readonly CommodityDef[] = [
  {
    id: 'electronics',
    name: 'Electronics',
    basePricePerKg: 18,
    highValue: true,
  },
  {
    id: 'perishables',
    name: 'Perishables',
    basePricePerKg: 4.5,
    perishable: true,
  },
  {
    id: 'machinery',
    name: 'Machinery',
    basePricePerKg: 6,
  },
  {
    id: 'general',
    name: 'General cargo',
    basePricePerKg: 2.2,
  },
  {
    id: 'supplies',
    name: 'Supplies',
    basePricePerKg: 2.5,
  },
  {
    id: 'fuel',
    name: 'Jet-A fuel',
    basePricePerKg: 0.95,
    kind: 'fuel',
  },
  {
    id: 'mro_parts',
    name: 'Aircraft parts (MRO)',
    basePricePerKg: 12,
    highValue: true,
    kind: 'mro',
  },
] as const;

/** Freight-board commodities (excludes terminal fuel + MRO parts). */
export const CAREER_CARGO_COMMODITIES: readonly CommodityDef[] =
  CAREER_COMMODITIES.filter((c) => c.kind !== 'fuel' && c.kind !== 'mro');

/**
 * Global cargo flow balance vs hub produce/consume biases (pulse-tuned).
 * Applied each tick on effective flows so existing saves pick it up without reset.
 * Seed bases stay raw; do not also bake these into baseProduction (would double-count).
 * Target: Value/Heavy fill ~30–50% with both surplus and shortage hubs so freights form.
 */
export const CARGO_FLOW_BALANCE: Readonly<
  Partial<Record<CommodityId, { production: number; consumption: number }>>
> = {
  // Value: paired with DEFAULT biases (~0.15 prod / ~0.55 cons) so typical
  // omit/consumer hubs are slight net sinks; explicit producers stay exporters.
  electronics: { production: 2.0, consumption: 0.7 },
  machinery: { production: 2.05, consumption: 0.68 },
  // Dry equilibrium is bistable: hubs pin near cap until prod/cons crosses a knee,
  // then fill drops sharply into a smooth "flowing" band. These land general,
  // supplies, and perishables just past their knees at ~45–60% p50 with balanced
  // surplus/shortage hubs across seeds (see profiles/career calibration sweeps).
  // General responds to the consumption dial; supplies/perishables plateau on
  // consumption and need a production cut instead.
  general: { production: 0.84, consumption: 1.21 },
  supplies: { production: 0.3, consumption: 1.15 },
  perishables: { production: 0.45, consumption: 1.2 },
};

function cargoFlowBalance(commodityId: CommodityId): {
  production: number;
  consumption: number;
} {
  return CARGO_FLOW_BALANCE[commodityId] ?? { production: 1, consumption: 1 };
}

/** Default produce bias when a hub omits a cargo commodity. */
const DEFAULT_CARGO_PROD_BIAS: Readonly<Partial<Record<CommodityId, number>>> = {
  electronics: 0.15,
  machinery: 0.14,
  general: 0.14,
  perishables: 0.15,
  supplies: 0.15,
};

/** Default consume bias when a hub omits a cargo commodity. */
const DEFAULT_CARGO_CONS_BIAS: Readonly<Partial<Record<CommodityId, number>>> = {
  electronics: 0.55,
  machinery: 0.55,
  general: 0.3,
  perishables: 0.25,
  supplies: 0.25,
};

/** Major Jet-A production hubs (BR + US + CA + MX career anchors). */
export const FUEL_HUB_ICAOS = new Set([
  // BR producers (~1 per 3 hubs at 60 airports)
  'SBGR',
  'SBGL',
  'SBKP',
  'SBCF',
  'SBPA',
  'SBRF',
  'SBCT',
  'SBSV',
  'SBEG',
  'SBBR',
  'SBFZ',
  'SBBE',
  'SBGO',
  'SBVT',
  'SBSN',
  'SBPJ',
  'SBFI',
  'SBSL',
  'SBTE',
  'SBUL',
  // US continental Jet-A producers (~1 per 2–3 airports).
  'KMIA',
  'KATL',
  'KJFK',
  'KORD',
  'KIAH',
  'KDFW',
  'KDEN',
  'KLAX',
  'KSEA',
  // Canada Jet-A producers
  'CYVR',
  'CYYC',
  'CYEG',
  'CYYZ',
  'CYUL',
  'CYWG',
  'CYOW',
  'CYHZ',
  // Mexico Jet-A producers
  'MMMX',
  'MMMY',
  'MMGL',
  'MMUN',
  'MMTJ',
  'MMHO',
  'MMVR',
  'MMSD',
  // Argentina / Chile Jet-A producers (were missing — spokes starved)
  'SAEZ',
  'SABE',
  'SACO',
  'SAME',
  'SCEL',
  'SCTE',
  'SCDA',
  'SCCI',
  // Uruguay / Paraguay
  'SUMU',
  'SGAS',
  // Peru / Bolivia / Ecuador
  'SPJC',
  'SPZO',
  'SPQT',
  'SLLP',
  'SLVR',
  'SEQU',
  'SEGU',
  // Colombia / Venezuela
  'SKBO',
  'SKRG',
  'SKCG',
  'SKCL',
  'SVMI',
  'SVMC',
  'SVPR',
  // Guianas
  'SYCJ',
  'SMJP',
  'SOCA',
  // Central America
  'MPTO',
  'MPDA',
  'MROC',
  'MRLB',
  'MNMG',
  'MHTG',
  'MHLM',
  'MSLP',
  'MGGT',
  'MZBZ',
  // Caribbean
  'MUHA',
  'MUCU',
  'MDSD',
  'MDPC',
  'MTPP',
  'MKJP',
  'MKJS',
  'MYNN',
  'TTPP',
  'TBPB',
  'TLPL',
  'TGPY',
  'TAPA',
  'TJSJ',
  'TJBQ',
  'TFFR',
  'TFFF',
  'TNCC',
  'TNCM',
  'TNCA',
  'TIST',
  // EU-1 Western core
  'LPPT',
  'LPPR',
  'LEMD',
  'LEBL',
  'LEMG',
  'LEBB',
  'LFPG',
  'LFLL',
  'LFML',
  'LFBD',
  'EGLL',
  'EGCC',
  'EGPH',
  'EDDF',
  'EDDH',
  'EDDB',
  'EDDM',
  'EHAM',
  'EBBR',
  'LIRF',
  'LIMC',
  'LIRN',
  // EU-2 Nordics + Alps + IE
  'EIDW',
  'EINN',
  'EKCH',
  'EKBI',
  'ENGM',
  'ENBR',
  'ENVA',
  'ESSA',
  'ESGG',
  'ESPA',
  'EFHK',
  'EFTU',
  'LSZH',
  'LSGG',
  'LOWW',
  'LOWI',
  // EU-3 Central-East + Baltics
  'EPWA',
  'EPGD',
  'EPKT',
  'EPKK',
  'LKPR',
  'LKTB',
  'LZIB',
  'LZKZ',
  'LHBP',
  'LHDC',
  'EETN',
  'EVRA',
  'EYVI',
  'EYKA',
  // EU-4 Balkans
  'LDZA',
  'LDSP',
  'LJLJ',
  'LROP',
  'LRCL',
  'LBSF',
  'LBWN',
  'LGAV',
  'LGTS',
  'LYBE',
  'LYNI',
  // EU-5 Iceland
  'BIKF',
  'BIAR',
  // EU-6 W. Balkans
  'LQSA',
  'LYPG',
  'LATI',
  'LWSK',
  // EU-7 East
  'LTFM',
  'LTAC',
  'LTBJ',
  'LTAI',
  'UKBB',
  'UKLL',
  'UKOO',
  // EU-8 Europe gaps
  'UMMS',
  'LUKK',
  'UGTB',
  'UGSB',
  'UDYZ',
  'UBBB',
  'ELLX',
  'LMML',
  'LCLK',
  'BKPR',
  // MENA-1 Mediterranean face
  'GMMN',
  'GMTT',
  'DAAG',
  'DAOO',
  'DTTA',
  'HECA',
  'HEBA',
  'LLBG',
  // MENA-2 Gulf
  'OEJN',
  'OERK',
  'OEDF',
  'OMDB',
  'OMAA',
  'OTHH',
  'OBBI',
  'OKKK',
  'OOMS',
  // MENA-3 North Gulf
  'ORBI',
  'ORMM',
  'OIIE',
  'OISS',
  // MENA-4 Levant-east
  'OJAI',
  'OLBA',
  'OSDI',
  // MENA-5 Maghreb/Nile gap
  'HLLM',
  'HSSK',
  // MENA-6 Yemen
  'OYSN',
  'OYAA',
  // Asia-1 Pakistan
  'OPIS',
  'OPKC',
  // Asia-2 India west
  'VIDP',
  'VABB',
  'VAAH',
  // Asia-3 India south / east
  'VOBL',
  'VOMM',
  'VECC',
  // Asia-4 Sri Lanka
  'VCBI',
  'VCRI',
  // Asia-5 Central Asia
  'UAAA',
  'UACC',
  'UTTT',
  'UTAA',
  // Asia-6 Tajikistan / Kyrgyzstan
  'UTDD',
  'UCFM',
  'UCFO',
  // Asia-7 Afghanistan
  'OAKB',
  'OAKN',
  // Asia-8 Nepal / Bangladesh
  'VNKT',
  'VGHS',
  'VGEG',
  // Asia-9 Bhutan / Myanmar
  'VQPR',
  'VYYY',
  'VYMD',
]);

/** Trip-only strips: no cargo economy (coords/runways for bush trips only). */
export function freezeBushTripOnlyTerminal(terminal: AirportTerminal): void {
  if (!isBushTripOnlyHub(terminal.icao) && terminal.bushTripOnly !== true) {
    return;
  }
  terminal.bushTripOnly = true;
  if (!terminal.baseProduction) terminal.baseProduction = {};
  if (!terminal.baseConsumption) terminal.baseConsumption = {};
  for (const c of CAREER_COMMODITIES) {
    terminal.production[c.id] = 0;
    terminal.consumption[c.id] = 0;
    terminal.baseProduction[c.id] = 0;
    terminal.baseConsumption[c.id] = 0;
    const existing = terminal.inventory[c.id];
    if (existing) {
      existing.stockKg = 0;
      existing.capacityKg = Math.max(1, existing.capacityKg);
    } else {
      terminal.inventory[c.id] = pile(0, 1);
    }
  }
}

/** Seed or repair fuel inventory + baseline flows on a terminal. */
export function ensureAirportFuelInventory(terminal: AirportTerminal): void {
  if (isBushTripOnlyHub(terminal.icao) || terminal.bushTripOnly === true) {
    freezeBushTripOnlyTerminal(terminal);
    return;
  }
  const icao = terminal.icao.trim().toUpperCase();
  const hub = FUEL_HUB_ICAOS.has(icao);
  const cap = hub ? 500_000 : 120_000;
  // kg / 15-min tick (legacy hourly rates ÷ 4)
  const prod = hub ? 2_000 : 200;
  const cons = hub ? 750 : 375;
  const existingCap = terminal.inventory.fuel?.capacityKg ?? 0;
  /** Spoke→hub promotion (e.g. US majors added to FUEL_HUB_ICAOS). */
  const upgradingToHub = hub && existingCap > 0 && existingCap < cap;

  if (!terminal.inventory.fuel) {
    terminal.inventory.fuel = pile(Math.round(cap * 0.55), cap);
  } else {
    terminal.inventory.fuel.capacityKg = Math.max(
      terminal.inventory.fuel.capacityKg,
      cap,
    );
    terminal.inventory.fuel.stockKg = clamp(
      terminal.inventory.fuel.stockKg,
      0,
      terminal.inventory.fuel.capacityKg,
    );
  }

  terminal.baseProduction = { ...terminal.baseProduction, fuel: prod };
  terminal.baseConsumption = { ...terminal.baseConsumption, fuel: cons };
  if (terminal.production.fuel === undefined || upgradingToHub) {
    terminal.production = { ...terminal.production, fuel: prod };
  }
  if (terminal.consumption.fuel === undefined || upgradingToHub) {
    terminal.consumption = { ...terminal.consumption, fuel: cons };
  }
}

export function ensureWorldFuelInventory(world: CareerEconomyWorld): void {
  for (const ap of world.airports) {
    ensureAirportFuelInventory(ap);
  }
}

/** Seed or repair aircraft-parts (MRO) inventory + baseline flows on a terminal. */
export function ensureAirportMroInventory(terminal: AirportTerminal): void {
  if (isBushTripOnlyHub(terminal.icao) || terminal.bushTripOnly === true) {
    freezeBushTripOnlyTerminal(terminal);
    return;
  }
  const tier = hubTierOf(terminal);
  const cap =
    tier === 'major' ? 80_000 : tier === 'regional' ? 35_000 : 12_000;
  // kg / 15-min tick (legacy hourly rates ÷ 4)
  const prod =
    tier === 'major' ? 225 : tier === 'regional' ? 70 : 10;
  const cons =
    tier === 'major' ? 105 : tier === 'regional' ? 55 : 22;

  if (!terminal.inventory.mro_parts) {
    terminal.inventory.mro_parts = pile(Math.round(cap * 0.5), cap);
  } else {
    terminal.inventory.mro_parts.capacityKg = Math.max(
      terminal.inventory.mro_parts.capacityKg,
      cap,
    );
    terminal.inventory.mro_parts.stockKg = clamp(
      terminal.inventory.mro_parts.stockKg,
      0,
      terminal.inventory.mro_parts.capacityKg,
    );
  }

  terminal.baseProduction = { ...terminal.baseProduction, mro_parts: prod };
  terminal.baseConsumption = { ...terminal.baseConsumption, mro_parts: cons };
  if (terminal.production.mro_parts === undefined) {
    terminal.production = { ...terminal.production, mro_parts: prod };
  }
  if (terminal.consumption.mro_parts === undefined) {
    terminal.consumption = { ...terminal.consumption, mro_parts: cons };
  }
}

export function ensureWorldMroInventory(world: CareerEconomyWorld): void {
  for (const ap of world.airports) {
    ensureAirportMroInventory(ap);
  }
}

/**
 * Backfill Supplies piles on legacy airports (Tier-0 Dry ladder companion to General).
 */
export function ensureAirportSuppliesInventory(terminal: AirportTerminal): void {
  if (isBushTripOnlyHub(terminal.icao) || terminal.bushTripOnly === true) {
    freezeBushTripOnlyTerminal(terminal);
    return;
  }
  const tier = hubTierOf(terminal);
  const cap =
    tier === 'major' ? 90_000 : tier === 'regional' ? 45_000 : 22_000;
  const prod =
    tier === 'major' ? 180 : tier === 'regional' ? 90 : 40;
  const cons =
    tier === 'major' ? 160 : tier === 'regional' ? 95 : 55;

  if (!terminal.inventory.supplies) {
    terminal.inventory.supplies = pile(Math.round(cap * 0.45), cap);
  } else {
    terminal.inventory.supplies.capacityKg = Math.max(
      terminal.inventory.supplies.capacityKg,
      cap,
    );
    terminal.inventory.supplies.stockKg = clamp(
      terminal.inventory.supplies.stockKg,
      0,
      terminal.inventory.supplies.capacityKg,
    );
  }

  terminal.baseProduction = {
    ...terminal.baseProduction,
    supplies: terminal.baseProduction?.supplies ?? prod,
  };
  terminal.baseConsumption = {
    ...terminal.baseConsumption,
    supplies: terminal.baseConsumption?.supplies ?? cons,
  };
  if (terminal.production.supplies === undefined) {
    terminal.production = { ...terminal.production, supplies: prod };
  }
  if (terminal.consumption.supplies === undefined) {
    terminal.consumption = { ...terminal.consumption, supplies: cons };
  }
}

export function ensureWorldSuppliesInventory(world: CareerEconomyWorld): void {
  for (const ap of world.airports) {
    ensureAirportSuppliesInventory(ap);
  }
}

/**
 * Stamp curated hubTier on legacy airports. First time only: rescale cargo
 * warehouses/flows toward the tier profile so flat ~70t seeds become majors vs spokes.
 */
export function ensureAirportHubTier(terminal: AirportTerminal): void {
  const icao = terminal.icao.toUpperCase();
  const tier = HUB_TIER_BY_ICAO[icao] ?? 'spoke';
  const alreadyStamped =
    terminal.hubTier === 'major' ||
    terminal.hubTier === 'regional' ||
    terminal.hubTier === 'spoke';
  // Keep bush / trip-only flags in sync with catalog (coverage migrate + legacy).
  if (isBushHub(terminal.icao)) terminal.bush = true;
  else if (terminal.bush) delete terminal.bush;
  if (isBushTripOnlyHub(terminal.icao)) terminal.bushTripOnly = true;
  else if (terminal.bushTripOnly) delete terminal.bushTripOnly;
  // MSFS homologation overrides win over curated catalog / PLN estimates.
  if (applyMsfsBushHubOverrideToTerminal(terminal)) {
    /* lat/lon/name stamped from MSFS override */
  } else {
    // Catalog lat/lon/name wins when no MSFS override — bushTripOnly hubs were
    // once seeded from PLN User WPs several NM off the field; also repairs
    // mislabeled ICAOs (e.g. SAVN was Neuquén coords).
    const catalog = CAREER_HUB_COORDS[icao];
    if (catalog) {
      if (
        Number.isFinite(catalog.lat) &&
        Number.isFinite(catalog.lon) &&
        (Math.abs(terminal.lat - catalog.lat) > 1e-4 ||
          Math.abs(terminal.lon - catalog.lon) > 1e-4)
      ) {
        terminal.lat = catalog.lat;
        terminal.lon = catalog.lon;
      }
      if (catalog.name && terminal.name !== catalog.name) {
        terminal.name = catalog.name;
      }
    }
  }
  if (alreadyStamped) {
    // Keep map as source of truth if ICAO map was updated.
    terminal.hubTier = HUB_TIER_BY_ICAO[icao] ?? terminal.hubTier;
    freezeBushTripOnlyTerminal(terminal);
    return;
  }

  const profile = HUB_TIER_PROFILE[tier];
  terminal.hubTier = tier;
  if (!terminal.baseProduction) terminal.baseProduction = { ...(terminal.production ?? {}) };
  if (!terminal.baseConsumption) terminal.baseConsumption = { ...(terminal.consumption ?? {}) };

  for (const c of CAREER_CARGO_COMMODITIES) {
    const stock = terminal.inventory[c.id];
    if (stock && stock.capacityKg > 0) {
      const fill = stock.stockKg / stock.capacityKg;
      stock.capacityKg = Math.max(1_000, Math.round(stock.capacityKg * profile.capacityMult));
      stock.stockKg = clamp(Math.round(stock.capacityKg * fill), 0, stock.capacityKg);
    }
    const baseProd = terminal.baseProduction[c.id] ?? terminal.production[c.id] ?? 0;
    const baseCons = terminal.baseConsumption[c.id] ?? terminal.consumption[c.id] ?? 0;
    terminal.baseProduction[c.id] = Math.round(baseProd * profile.flowMult);
    terminal.baseConsumption[c.id] = Math.round(baseCons * profile.flowMult);
  }
  freezeBushTripOnlyTerminal(terminal);
}

export function ensureWorldHubTiers(world: CareerEconomyWorld): void {
  for (const ap of world.airports) {
    ensureAirportHubTier(ap);
  }
}

const COMMODITY_BY_ID: Record<CommodityId, CommodityDef> = Object.fromEntries(
  CAREER_COMMODITIES.map((c) => [c.id, c]),
) as Record<CommodityId, CommodityDef>;

export function getCommodity(id: CommodityId): CommodityDef {
  return COMMODITY_BY_ID[id];
}

/** Reference coordinates for career hubs (WGS84). */
export const CAREER_HUB_COORDS: Readonly<
  Record<string, { lat: number; lon: number; name?: string }>
> = {
  ...Object.fromEntries(
    BR_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    US_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    CA_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    MX_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    AR_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    CL_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    UY_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    PY_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    PE_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    BO_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    EC_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    CO_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    VE_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    GY_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    SR_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    GF_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    PA_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    CR_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    NI_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    HN_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    SV_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    GT_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    BZ_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    CU_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    DO_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    HT_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    JM_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    BS_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    TT_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    BB_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    LC_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    GD_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    AG_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    GP_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    MQ_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    CW_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    SX_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    AW_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    PT_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    ES_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    FR_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    GB_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    DE_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    NL_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    BE_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    IT_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    IE_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    DK_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    NO_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    SE_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    FI_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    CH_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    AT_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    PL_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    CZ_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    SK_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    HU_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    EE_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    LV_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    LT_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    HR_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    SI_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    RO_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    BG_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    GR_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    RS_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    IS_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    BA_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    ME_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    AL_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    MK_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    TR_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    UA_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    BY_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    MD_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    GE_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    AM_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    AZ_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    LU_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    MT_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    CY_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    XK_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    MA_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    DZ_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    TN_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    EG_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    IL_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    SA_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    AE_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    QA_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    BH_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    KW_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    OM_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    IQ_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    IR_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    JO_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    LB_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    SY_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    LY_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    SD_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    YE_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    PK_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    IN_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    LK_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    KZ_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    UZ_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    TM_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    TJ_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    KG_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    AF_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    NP_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    BD_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    BT_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    MM_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
};

export function resolveAirportCoords(
  icao: string,
  terminal?: Pick<AirportTerminal, 'lat' | 'lon'> | null,
): { lat: number; lon: number } | undefined {
  const code = icao.trim().toUpperCase();
  const msfs = lookupMsfsBushHubOverride(code);
  if (msfs) return { lat: msfs.lat, lon: msfs.lon };
  if (
    terminal &&
    Number.isFinite(terminal.lat) &&
    Number.isFinite(terminal.lon) &&
    !(terminal.lat === 0 && terminal.lon === 0)
  ) {
    return { lat: terminal.lat, lon: terminal.lon };
  }
  return CAREER_HUB_COORDS[code];
}

/** Refuse MSFS Facilities stamps when the sim airport is not the catalog hub. */
export const MSFS_HUB_MATCH_MAX_NM = 25;

/**
 * Compare a SimConnect Facilities hit to the curated catalog.
 * Does not apply CAREER_AIRPORT_ICAO_REMAP to the facility ident — MSFS SCCD
 * is Castro, not Carriel Sur (SCIE).
 */
export function msfsFacilityMatchesCareerHub(
  requestedIcao: string,
  facility: { icao?: string; lat: number; lon: number },
): { ok: true } | { ok: false; reason: string } {
  const want = requestedIcao.trim().toUpperCase();
  const catalog = CAREER_HUB_COORDS[want];
  if (!catalog) {
    return { ok: false, reason: `${want} is not a career hub` };
  }
  const got = (facility.icao ?? '').trim().toUpperCase();
  if (got && got !== want) {
    return { ok: false, reason: `MSFS ident ${got} ≠ catalog ${want}` };
  }
  const nm = distanceNm(catalog, facility);
  if (nm > MSFS_HUB_MATCH_MAX_NM) {
    const label = catalog.name ?? want;
    return {
      ok: false,
      reason: `MSFS ${want} is ${nm.toFixed(0)} nm from catalog ${label}`,
    };
  }
  return { ok: true };
}

/** Great-circle distance in nautical miles. */
export function distanceNm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const rLat1 = toRad(a.lat);
  const rLat2 = toRad(b.lat);
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
  const earthNm = 3440.065;
  return 2 * earthNm * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Default radius around dest airport to accept auto-settle (nm). */
export const DEFAULT_SETTLE_RADIUS_NM = 12;

export function isNearAirport(
  position: { lat: number; lon: number },
  airport: { lat: number; lon: number },
  radiusNm = DEFAULT_SETTLE_RADIUS_NM,
): { near: boolean; distanceNm: number } {
  const d = distanceNm(position, airport);
  return { near: d <= radiusNm, distanceNm: d };
}

export type OriginProximityCode =
  | 'ORIGIN_OK'
  | 'ORIGIN_TOO_FAR'
  | 'ORIGIN_NOT_ON_GROUND'
  | 'ORIGIN_POSITION_UNKNOWN'
  | 'ORIGIN_COORDS_UNRESOLVED';

export type OriginProximityResult = {
  ok: boolean;
  code: OriginProximityCode;
  severity: 'info' | 'warn' | 'fail';
  message: string;
  originIcao: string;
  distanceNm?: number;
  radiusNm: number;
};

/**
 * Preflight gate: live MSFS position must be on the ground near mission origin.
 * Missing hub coords → warn (cannot prove). Same default radius as settle.
 */
export function evaluateOriginProximity(opts: {
  originIcao: string;
  position?: { lat: number; lon: number } | null;
  onGround?: boolean | null;
  originCoords?: { lat: number; lon: number } | null;
  radiusNm?: number;
}): OriginProximityResult {
  const originIcao = opts.originIcao.trim().toUpperCase();
  const radiusNm = opts.radiusNm ?? DEFAULT_SETTLE_RADIUS_NM;

  if (!opts.originCoords) {
    return {
      ok: true,
      code: 'ORIGIN_COORDS_UNRESOLVED',
      severity: 'warn',
      message: `Origin ${originIcao} has no catalog coordinates — cannot verify aircraft location`,
      originIcao,
      radiusNm,
    };
  }

  if (
    !opts.position ||
    !Number.isFinite(opts.position.lat) ||
    !Number.isFinite(opts.position.lon)
  ) {
    return {
      ok: false,
      code: 'ORIGIN_POSITION_UNKNOWN',
      severity: 'fail',
      message: `Live aircraft position unavailable — cannot verify at ${originIcao}`,
      originIcao,
      radiusNm,
    };
  }

  const { near, distanceNm: dist } = isNearAirport(
    opts.position,
    opts.originCoords,
    radiusNm,
  );

  if (opts.onGround === false) {
    return {
      ok: false,
      code: 'ORIGIN_NOT_ON_GROUND',
      severity: 'fail',
      message: `Aircraft airborne ${dist.toFixed(1)} nm from ${originIcao} (need on ground ≤${radiusNm} nm)`,
      originIcao,
      distanceNm: dist,
      radiusNm,
    };
  }

  if (!near) {
    return {
      ok: false,
      code: 'ORIGIN_TOO_FAR',
      severity: 'fail',
      message: `Aircraft ${dist.toFixed(1)} nm from ${originIcao} (need ≤${radiusNm} nm)`,
      originIcao,
      distanceNm: dist,
      radiusNm,
    };
  }

  return {
    ok: true,
    code: 'ORIGIN_OK',
    severity: 'info',
    message: `At ${originIcao} · ${dist.toFixed(1)} nm (≤${radiusNm} nm)`,
    originIcao,
    distanceNm: dist,
    radiusNm,
  };
}

/** Invalidate when hub count changes (array mutated in place). */
type AirportLookupCache = {
  len: number;
  byIcao: Map<string, AirportTerminal>;
  routeNm: Map<string, number | undefined>;
};

const airportLookupByList = new WeakMap<
  CareerEconomyWorld['airports'],
  AirportLookupCache
>();

function airportLookup(
  airports: CareerEconomyWorld['airports'],
): AirportLookupCache {
  let cache = airportLookupByList.get(airports);
  if (!cache || cache.len !== airports.length) {
    const byIcao = new Map<string, AirportTerminal>();
    for (const airport of airports) {
      byIcao.set(airport.icao.toUpperCase(), airport);
    }
    cache = { len: airports.length, byIcao, routeNm: new Map() };
    airportLookupByList.set(airports, cache);
  }
  return cache;
}

/** O(1) hub lookup (cached; refreshes when `airports.length` changes). */
export function airportByIcao(
  world: Pick<CareerEconomyWorld, 'airports'>,
  icao: string,
): AirportTerminal | undefined {
  return airportLookup(world.airports).byIcao.get(icao.trim().toUpperCase());
}

export function routeDistanceNm(
  world: Pick<CareerEconomyWorld, 'airports'>,
  originIcao: string,
  destIcao: string,
): number | undefined {
  const originCode = originIcao.trim().toUpperCase();
  const destCode = destIcao.trim().toUpperCase();
  if (originCode === destCode) return 0;
  const lookup = airportLookup(world.airports);
  const key =
    originCode < destCode
      ? `${originCode}|${destCode}`
      : `${destCode}|${originCode}`;
  if (lookup.routeNm.has(key)) {
    return lookup.routeNm.get(key);
  }
  const origin = lookup.byIcao.get(originCode);
  const dest = lookup.byIcao.get(destCode);
  const originCoords = resolveAirportCoords(originCode, origin);
  const destCoords = resolveAirportCoords(destCode, dest);
  const nm =
    originCoords && destCoords
      ? distanceNm(originCoords, destCoords)
      : undefined;
  lookup.routeNm.set(key, nm);
  return nm;
}

function pile(stockKg: number, capacityKg: number): StockPile {
  return {
    stockKg: clamp(stockKg, 0, capacityKg),
    capacityKg,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Fill ratio 0..1; low stock → high local price multiplier. */
export function localPriceMultiplier(stock: StockPile): number {
  if (stock.capacityKg <= 0) {
    return 1;
  }
  const fill = stock.stockKg / stock.capacityKg;
  // 0% fill → ~2.2×, 50% → ~1.0×, 100% → ~0.45×
  return clamp(0.45 + (1 - fill) * 1.75, 0.4, 2.4);
}

export function localUnitPriceUsd(commodityId: CommodityId, stock: StockPile): number {
  return getCommodity(commodityId).basePricePerKg * localPriceMultiplier(stock);
}

function ensurePile(
  terminal: AirportTerminal,
  commodityId: CommodityId,
  defaultCapacity = 80_000,
): StockPile {
  const existing = terminal.inventory[commodityId];
  if (existing) {
    return existing;
  }
  const created = pile(0, defaultCapacity);
  terminal.inventory[commodityId] = created;
  return created;
}

/**
 * Seed the career cargo world: Americas + EU-1..EU-4 hubs, with
 * asymmetric production/consumption so ticks create explainable lanes.
 */
export function createSeedEconomyWorld(opts: { seed?: string } = {}): CareerEconomyWorld {
  const seed = opts.seed?.trim() || 'skyline-career-br-v1';
  const rng = mulberry32(hashSeed(seed));

  assertBrCareerHubCatalog();
  assertUsCareerHubCatalog();
  assertUsPrCareerHubCatalog();
  assertCaCareerHubCatalog();
  assertMxCareerHubCatalog();
  assertArCareerHubCatalog();
  assertClCareerHubCatalog();
  assertUyCareerHubCatalog();
  assertPyCareerHubCatalog();
  assertPeCareerHubCatalog();
  assertBoCareerHubCatalog();
  assertEcCareerHubCatalog();
  assertCoCareerHubCatalog();
  assertVeCareerHubCatalog();
  assertGyCareerHubCatalog();
  assertSrCareerHubCatalog();
  assertGfCareerHubCatalog();
  assertPaCareerHubCatalog();
  assertCrCareerHubCatalog();
  assertNiCareerHubCatalog();
  assertHnCareerHubCatalog();
  assertSvCareerHubCatalog();
  assertGtCareerHubCatalog();
  assertBzCareerHubCatalog();
  assertCuCareerHubCatalog();
  assertDoCareerHubCatalog();
  assertHtCareerHubCatalog();
  assertJmCareerHubCatalog();
  assertBsCareerHubCatalog();
  assertTtCareerHubCatalog();
  assertBbCareerHubCatalog();
  assertLcCareerHubCatalog();
  assertGdCareerHubCatalog();
  assertAgCareerHubCatalog();
  assertGpCareerHubCatalog();
  assertMqCareerHubCatalog();
  assertCwCareerHubCatalog();
  assertSxCareerHubCatalog();
  assertAwCareerHubCatalog();
  assertUsViCareerHubCatalog();
  assertPtCareerHubCatalog();
  assertEsCareerHubCatalog();
  assertFrCareerHubCatalog();
  assertGbCareerHubCatalog();
  assertDeCareerHubCatalog();
  assertNlCareerHubCatalog();
  assertBeCareerHubCatalog();
  assertItCareerHubCatalog();
  assertIeCareerHubCatalog();
  assertDkCareerHubCatalog();
  assertNoCareerHubCatalog();
  assertSeCareerHubCatalog();
  assertFiCareerHubCatalog();
  assertChCareerHubCatalog();
  assertAtCareerHubCatalog();
  assertPlCareerHubCatalog();
  assertCzCareerHubCatalog();
  assertSkCareerHubCatalog();
  assertHuCareerHubCatalog();
  assertEeCareerHubCatalog();
  assertLvCareerHubCatalog();
  assertLtCareerHubCatalog();
  assertHrCareerHubCatalog();
  assertSiCareerHubCatalog();
  assertRoCareerHubCatalog();
  assertBgCareerHubCatalog();
  assertGrCareerHubCatalog();
  assertRsCareerHubCatalog();
  assertIsCareerHubCatalog();
  assertBaCareerHubCatalog();
  assertMeCareerHubCatalog();
  assertAlCareerHubCatalog();
  assertMkCareerHubCatalog();
  assertTrCareerHubCatalog();
  assertUaCareerHubCatalog();
  assertByCareerHubCatalog();
  assertMdCareerHubCatalog();
  assertGeCareerHubCatalog();
  assertAmCareerHubCatalog();
  assertAzCareerHubCatalog();
  assertLuCareerHubCatalog();
  assertMtCareerHubCatalog();
  assertCyCareerHubCatalog();
  assertXkCareerHubCatalog();
  assertMaCareerHubCatalog();
  assertDzCareerHubCatalog();
  assertTnCareerHubCatalog();
  assertEgCareerHubCatalog();
  assertIlCareerHubCatalog();
  assertSaCareerHubCatalog();
  assertAeCareerHubCatalog();
  assertQaCareerHubCatalog();
  assertBhCareerHubCatalog();
  assertKwCareerHubCatalog();
  assertOmCareerHubCatalog();
  assertIqCareerHubCatalog();
  assertIrCareerHubCatalog();
  assertJoCareerHubCatalog();
  assertLbCareerHubCatalog();
  assertSyCareerHubCatalog();
  assertLyCareerHubCatalog();
  assertSdCareerHubCatalog();
  assertYeCareerHubCatalog();
  assertPkCareerHubCatalog();
  assertInCareerHubCatalog();
  assertLkCareerHubCatalog();
  assertKzCareerHubCatalog();
  assertUzCareerHubCatalog();
  assertTmCareerHubCatalog();
  assertTjCareerHubCatalog();
  assertKgCareerHubCatalog();
  assertAfCareerHubCatalog();
  assertNpCareerHubCatalog();
  assertBdCareerHubCatalog();
  assertBtCareerHubCatalog();
  assertMmCareerHubCatalog();
  assertDispatchHubsAreSimBriefKnown();
  assertBushTripCatalog();

  const hubs: Array<{
    icao: string;
    name: string;
    region: string;
    hubTier: HubTier;
    /** Relative production bias by commodity. */
    produce: Partial<Record<CommodityId, number>>;
    /** Relative consumption bias. */
    consume: Partial<Record<CommodityId, number>>;
    bush?: boolean;
    bushTripOnly?: boolean;
  }> = [
    ...BR_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...US_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
      bushTripOnly: h.bushTripOnly === true,
    })),
    ...CA_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...MX_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...AR_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...CL_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...UY_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...PY_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...PE_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...BO_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...EC_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...CO_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...VE_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...GY_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...SR_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...GF_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...PA_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...CR_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...NI_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...HN_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...SV_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...GT_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...BZ_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...CU_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...DO_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...HT_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...JM_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...BS_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...TT_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...BB_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...LC_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...GD_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...AG_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...GP_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...MQ_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...CW_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...SX_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...AW_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...PT_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...ES_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...FR_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...GB_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...DE_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...NL_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...BE_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...IT_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...IE_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...DK_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...NO_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...SE_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...FI_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...CH_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...AT_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...PL_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...CZ_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...SK_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...HU_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...EE_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...LV_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...LT_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...HR_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...SI_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...RO_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...BG_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...GR_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...RS_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...IS_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...BA_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...ME_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...AL_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...MK_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...TR_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...UA_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...BY_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...MD_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...GE_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...AM_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...AZ_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...LU_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...MT_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...CY_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...XK_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...MA_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...DZ_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...TN_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...EG_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...IL_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...SA_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...AE_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...QA_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...BH_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...KW_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...OM_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...IQ_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...IR_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...JO_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...LB_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...SY_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...LY_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...SD_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...YE_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...PK_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...IN_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...LK_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...KZ_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...UZ_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...TM_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...TJ_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...KG_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...AF_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...NP_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...BD_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...BT_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
    ...MM_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
      bush: h.bush === true,
    })),
  ];

  const airports: AirportTerminal[] = hubs.map((h) => {
    const coords = CAREER_HUB_COORDS[h.icao];
    if (!coords) {
      throw new Error(`Missing coordinates for seeded airport ${h.icao}`);
    }
    const level = 1;
    const tier = h.hubTier;
    const tierProfile = HUB_TIER_PROFILE[tier];
    const capacityBoost = 1 + (level - 1) * 0.15;
    const inventory: AirportTerminal['inventory'] = {};
    const production: AirportTerminal['production'] = {};
    const consumption: AirportTerminal['consumption'] = {};
    const tripOnly = h.bushTripOnly === true;

    for (const c of CAREER_COMMODITIES) {
      if (tripOnly) {
        production[c.id] = 0;
        consumption[c.id] = 0;
        inventory[c.id] = pile(0, 1);
        continue;
      }
      if (c.id === 'fuel') {
        const hub = FUEL_HUB_ICAOS.has(h.icao);
        const cap = Math.round((hub ? 500_000 : 120_000) * capacityBoost);
        // kg / 15-min tick (legacy hourly rates ÷ 4)
        const prod = Math.round((hub ? 2_000 : 200) * (0.8 + rng() * 0.4));
        const cons = Math.round((hub ? 750 : 375) * (0.8 + rng() * 0.4));
        production[c.id] = prod;
        consumption[c.id] = cons;
        const startFill = 0.45 + rng() * 0.25;
        inventory[c.id] = pile(Math.round(cap * startFill), cap);
        continue;
      }
      if (c.id === 'mro_parts') {
        const tier = h.hubTier;
        const cap = Math.round(
          (tier === 'major' ? 80_000 : tier === 'regional' ? 35_000 : 12_000) *
            capacityBoost,
        );
        const prod = Math.round(
          (tier === 'major' ? 225 : tier === 'regional' ? 70 : 10) *
            (0.85 + rng() * 0.3),
        );
        const cons = Math.round(
          (tier === 'major' ? 105 : tier === 'regional' ? 55 : 22) *
            (0.85 + rng() * 0.3),
        );
        production[c.id] = prod;
        consumption[c.id] = cons;
        inventory[c.id] = pile(Math.round(cap * (0.4 + rng() * 0.25)), cap);
        continue;
      }
      const cap = Math.round(
        70_000 * capacityBoost * tierProfile.capacityMult * (0.85 + rng() * 0.3),
      );
      const prodBias = h.produce[c.id] ?? DEFAULT_CARGO_PROD_BIAS[c.id] ?? 0.15;
      const consBias = h.consume[c.id] ?? DEFAULT_CARGO_CONS_BIAS[c.id] ?? 0.25;
      // kg / 15-min tick — asymmetric by design, scaled by hub tier
      // (CARGO_FLOW_BALANCE applied later in applyProductionConsumption)
      const prod = Math.round(
        550 * prodBias * tierProfile.flowMult * (0.8 + rng() * 0.4),
      );
      const cons = Math.round(
        500 * consBias * tierProfile.flowMult * (0.8 + rng() * 0.4),
      );
      production[c.id] = prod;
      consumption[c.id] = cons;
      // Start near mid stock; Value below dest cutoff (0.45) so sinks exist on day 0
      let startFill = 0.35 + rng() * 0.35;
      if (c.id === 'electronics' || c.id === 'machinery') {
        startFill = 0.18 + rng() * 0.28;
      } else if (c.id === 'general') {
        startFill = 0.22 + rng() * 0.28;
      }
      inventory[c.id] = pile(Math.round(cap * startFill), cap);
    }

    return {
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: tier,
      ...(h.bush ? { bush: true } : {}),
      ...(h.bushTripOnly ? { bushTripOnly: true } : {}),
      lat: coords.lat,
      lon: coords.lon,
      level,
      inventory,
      baseProduction: { ...production },
      baseConsumption: { ...consumption },
      production,
      consumption,
    };
  });

  const now = Date.now();
  const regions = airports.map((a) => a.region);
  const world: CareerEconomyWorld = {
    version: 3,
    seed,
    tick: 0,
    lastBatchAtMs: now,
    lastSyncedAtMs: now,
    homeCountryId: 'BR',
    airports,
    lots: [],
    events: [],
    npcs: seedNpcFleet({ seed, regions }),
    npcFlights: [],
    inboundPending: [],
    fuelTrucks: seedFuelTruckFleet({ seed, regions }),
    fuelHauls: [],
    internationalLanes: CAREER_INTERNATIONAL_LANES.map((l) => ({ ...l })),
  };
  ensureWorldHubLevels(world);
  ensureHomeCountryId(world);
  ensureInternationalLanes(world);
  return world;
}

/** Continuous economy ticks = completed batches + fractional batch since lastBatchAtMs. */
export function continuousEconomyHours(
  world: CareerEconomyWorld,
  nowMs = Date.now(),
): number {
  const anchor = world.lastBatchAtMs ?? world.lastSyncedAtMs ?? nowMs;
  const frac = Math.max(0, nowMs - anchor) / MS_PER_TICK;
  return world.tick + frac;
}

function resolveBatchAnchorMs(raw: {
  lastBatchAtMs?: number;
  lastSyncedAtMs?: number;
}, nowMs: number): number {
  if (typeof raw.lastBatchAtMs === 'number' && Number.isFinite(raw.lastBatchAtMs)) {
    return raw.lastBatchAtMs;
  }
  if (typeof raw.lastSyncedAtMs === 'number' && Number.isFinite(raw.lastSyncedAtMs)) {
    return raw.lastSyncedAtMs;
  }
  return nowMs;
}

function tickToWallMs(anchorMs: number, worldTick: number, eventTick: number): number {
  return anchorMs - (worldTick - eventTick) * MS_PER_TICK;
}

function migrateNpcTimestamps(
  world: CareerEconomyWorld,
  fromVersion: number,
): void {
  const anchor = world.lastBatchAtMs;
  for (const flight of world.npcFlights) {
    const needsMs =
      typeof flight.departedAtMs !== 'number' ||
      !Number.isFinite(flight.departedAtMs) ||
      typeof flight.arrivesAtMs !== 'number' ||
      !Number.isFinite(flight.arrivesAtMs);
    if (needsMs || fromVersion < 3) {
      if (typeof flight.departedAtTick === 'number') {
        flight.departedAtMs = tickToWallMs(anchor, world.tick, flight.departedAtTick);
      } else if (typeof flight.departedAtMs !== 'number') {
        flight.departedAtMs = anchor;
      }
      if (typeof flight.arrivesAtTick === 'number') {
        flight.arrivesAtMs = tickToWallMs(anchor, world.tick, flight.arrivesAtTick);
      } else if (typeof flight.arrivesAtMs !== 'number') {
        flight.arrivesAtMs = flight.departedAtMs + hoursToMs(2);
      }
    }
  }
  for (const npc of world.npcs) {
    if (
      (typeof npc.busyUntilMs !== 'number' || !Number.isFinite(npc.busyUntilMs)) &&
      typeof npc.busyUntilTick === 'number'
    ) {
      npc.busyUntilMs = tickToWallMs(anchor, world.tick, npc.busyUntilTick);
    }
    if (
      (typeof npc.restUntilMs !== 'number' || !Number.isFinite(npc.restUntilMs)) &&
      typeof npc.restUntilTick === 'number'
    ) {
      npc.restUntilMs = tickToWallMs(anchor, world.tick, npc.restUntilTick);
    }
  }
}

/**
 * Merge airports present in the current seed that are missing from a legacy
 * save (e.g. BR-N / BR-CO / US anchors). Returns true when any hub was added.
 */
const CL_LA_SERENA = { lat: -29.9162, lon: -71.1995 };
const CL_CARRIEL_SUR = { lat: -36.7727, lon: -73.0631 };

function clHubNear(
  airport: Pick<AirportTerminal, 'lat' | 'lon'>,
  point: { lat: number; lon: number },
  maxNm = 40,
): boolean {
  return distanceNm(airport, point) <= maxNm;
}

function stampClHubFromCatalog(airport: AirportTerminal, icao: string): void {
  const hub = CL_CAREER_HUBS.find((row) => row.icao === icao);
  airport.icao = icao;
  if (!hub) return;
  airport.name = hub.name;
  airport.lat = hub.lat;
  airport.lon = hub.lon;
  airport.region = hub.region;
  airport.hubTier = hub.hubTier;
}

/**
 * Old CL catalog swapped idents: SCIE was La Serena (real SCSE) and SCCD was
 * Carriel Sur (real SCIE). Rewrite airports + lots before hub coverage runs.
 */
export function remapMislabelledClHubs(world: CareerEconomyWorld): boolean {
  let changed = false;
  const scie = world.airports.find((ap) => ap.icao.toUpperCase() === 'SCIE');
  if (scie && clHubNear(scie, CL_LA_SERENA)) {
    rewriteCareerIcaoFields(world, 'SCIE', 'SCSE');
    stampClHubFromCatalog(scie, 'SCSE');
    changed = true;
  }

  const sccd = world.airports.find((ap) => ap.icao.toUpperCase() === 'SCCD');
  const scieAfter = world.airports.find((ap) => ap.icao.toUpperCase() === 'SCIE');
  if (sccd) {
    if (clHubNear(sccd, CL_CARRIEL_SUR)) {
      rewriteCareerIcaoFields(world, 'SCCD', 'SCIE');
      if (scieAfter) {
        world.airports = world.airports.filter((ap) => ap !== sccd);
      } else {
        stampClHubFromCatalog(sccd, 'SCIE');
      }
    } else {
      world.lots = world.lots.filter(
        (lot) =>
          lot.originIcao.toUpperCase() !== 'SCCD' &&
          lot.destIcao.toUpperCase() !== 'SCCD',
      );
      world.airports = world.airports.filter((ap) => ap !== sccd);
      rewriteCareerIcaoFields(world, 'SCCD', 'SCIE');
    }
    changed = true;
  }
  return changed;
}

/**
 * Apply CAREER_AIRPORT_ICAO_REMAP to live world (lots / NPC flights / airports)
 * before orphan prune. Without this, remapped hubs (e.g. MPPB→MPPA) leave
 * in-flight NPC legs that crash settle with "Unknown origin airport".
 */
export function remapRetiredCareerAirportIdents(
  world: CareerEconomyWorld,
): boolean {
  let changed = false;
  for (const [fromRaw, toRaw] of Object.entries(CAREER_AIRPORT_ICAO_REMAP)) {
    const from = fromRaw.trim().toUpperCase();
    const to = toRaw.trim().toUpperCase();
    if (!from || !to || from === to) continue;
    if (!(to in CAREER_HUB_COORDS)) continue;

    const fromAp = world.airports.find(
      (ap) => ap.icao.trim().toUpperCase() === from,
    );
    const refsFrom =
      Boolean(fromAp) ||
      world.lots.some(
        (lot) =>
          lot.originIcao.trim().toUpperCase() === from ||
          lot.destIcao.trim().toUpperCase() === from,
      ) ||
      (world.npcFlights ?? []).some(
        (flight) =>
          flight.originIcao.trim().toUpperCase() === from ||
          flight.destIcao.trim().toUpperCase() === from,
      ) ||
      (world.inboundPending ?? []).some(
        (pending) =>
          pending.originIcao.trim().toUpperCase() === from ||
          pending.destIcao.trim().toUpperCase() === from,
      );
    if (!refsFrom) continue;

    rewriteCareerIcaoFields(world, from, to);
    const toAp = world.airports.find(
      (ap) => ap.icao.trim().toUpperCase() === to,
    );
    if (fromAp && toAp && fromAp !== toAp) {
      world.airports = world.airports.filter((ap) => ap !== fromAp);
    } else if (fromAp) {
      fromAp.icao = to;
      const coords = CAREER_HUB_COORDS[to];
      if (coords) {
        fromAp.lat = coords.lat;
        fromAp.lon = coords.lon;
      }
    }
    changed = true;
  }
  return changed;
}

/**
 * Drop airports (and their lots) that are no longer in the catalog — e.g.
 * MSFS-only strips removed because they cannot Dispatch.
 */
export function pruneOrphanCareerHubs(world: CareerEconomyWorld): boolean {
  const keep = new Set(
    Object.keys(CAREER_HUB_COORDS).map((icao) => icao.toUpperCase()),
  );
  const orphan = new Set(
    world.airports
      .map((ap) => ap.icao.trim().toUpperCase())
      .filter((icao) => icao && !keep.has(icao)),
  );
  // Also drop legs that still cite retired idents after a catalog remap.
  for (const lot of world.lots) {
    const o = lot.originIcao.trim().toUpperCase();
    const d = lot.destIcao.trim().toUpperCase();
    if (o && !keep.has(o)) orphan.add(o);
    if (d && !keep.has(d)) orphan.add(d);
  }
  for (const flight of world.npcFlights ?? []) {
    const o = flight.originIcao.trim().toUpperCase();
    const d = flight.destIcao.trim().toUpperCase();
    if (o && !keep.has(o)) orphan.add(o);
    if (d && !keep.has(d)) orphan.add(d);
  }
  if (orphan.size === 0) return false;

  world.airports = world.airports.filter(
    (ap) => !orphan.has(ap.icao.trim().toUpperCase()),
  );
  world.lots = world.lots.filter(
    (lot) =>
      !orphan.has(lot.originIcao.trim().toUpperCase()) &&
      !orphan.has(lot.destIcao.trim().toUpperCase()),
  );
  if (Array.isArray(world.inboundPending) && world.inboundPending.length > 0) {
    world.inboundPending = world.inboundPending.filter(
      (pending) =>
        !orphan.has(pending.originIcao.trim().toUpperCase()) &&
        !orphan.has(pending.destIcao.trim().toUpperCase()),
    );
  }
  if (Array.isArray(world.npcFlights) && world.npcFlights.length > 0) {
    world.npcFlights = world.npcFlights.filter(
      (flight) =>
        !orphan.has(flight.originIcao.trim().toUpperCase()) &&
        !orphan.has(flight.destIcao.trim().toUpperCase()),
    );
  }
  return true;
}

export function ensureCareerHubCoverage(world: CareerEconomyWorld): boolean {
  const have = new Set(world.airports.map((a) => a.icao.toUpperCase()));
  const fresh = createSeedEconomyWorld({ seed: world.seed });
  let added = false;
  for (const ap of fresh.airports) {
    const icao = ap.icao.toUpperCase();
    if (have.has(icao)) continue;
    world.airports.push(JSON.parse(JSON.stringify(ap)) as AirportTerminal);
    have.add(icao);
    added = true;
  }
  if (ensureInternationalLanes(world)) added = true;
  return added;
}

/**
 * Migrate legacy saves into the hybrid live-economy schema (v3).
 * Does not catch up wall-clock time — caller should set/keep lastBatchAtMs.
 */
export function migrateEconomyWorld(
  raw: CareerEconomyWorld | CareerEconomyWorldV1 | Record<string, unknown>,
  opts: { nowMs?: number } = {},
): CareerEconomyWorld {
  const nowMs = opts.nowMs ?? Date.now();
  const base = raw as {
    version?: number;
    seed?: string;
    tick?: number;
    lastSyncedAtMs?: number;
    lastBatchAtMs?: number;
    airports?: AirportTerminal[];
    lots?: ShipmentLot[];
    events?: EconomyEvent[];
    npcs?: NpcFreighter[];
    npcFlights?: NpcFlight[];
    fuelTrucks?: FuelTruck[];
    fuelHauls?: FuelHaul[];
  };
  if (!Array.isArray(base.airports)) {
    throw new Error('Invalid career economy: missing airports');
  }

  const version = Number(base.version);

  for (const ap of base.airports) {
    if (!ap.baseProduction) {
      ap.baseProduction = { ...(ap.production ?? {}) };
    }
    if (!ap.baseConsumption) {
      ap.baseConsumption = { ...(ap.consumption ?? {}) };
    }
  }

  const seed = typeof base.seed === 'string' ? base.seed : 'skyline-career-br-v1';
  let lastBatchAtMs = resolveBatchAnchorMs(base, nowMs);

  // Freshly migrated v1: anchor now without retroactive catch-up.
  if (version === 1) {
    lastBatchAtMs = nowMs;
  }

  const homeCountryRaw = (base as { homeCountryId?: unknown }).homeCountryId;
  const lanesRaw = (base as { internationalLanes?: unknown }).internationalLanes;
  const portListingsRaw = (base as { portListings?: unknown }).portListings;
  const portInventoriesRaw = (base as { portInventories?: unknown }).portInventories;
  const portConcessionsRaw = (base as { portConcessions?: unknown }).portConcessions;
  const migrated: CareerEconomyWorld = {
    version: 3,
    seed,
    tick: typeof base.tick === 'number' ? base.tick : 0,
    lastBatchAtMs,
    lastSyncedAtMs: lastBatchAtMs,
    homeCountryId:
      typeof homeCountryRaw === 'string' && homeCountryRaw.trim()
        ? homeCountryRaw.trim().toUpperCase()
        : undefined,
    airports: base.airports,
    lots: Array.isArray(base.lots) ? base.lots : [],
    events: Array.isArray(base.events) ? base.events : [],
    npcs: Array.isArray(base.npcs) ? base.npcs : [],
    npcFlights: Array.isArray(base.npcFlights) ? base.npcFlights : [],
    inboundPending: Array.isArray((base as { inboundPending?: unknown }).inboundPending)
      ? ((base as { inboundPending: CareerEconomyWorld['inboundPending'] }).inboundPending ?? [])
      : [],
    fuelTrucks: Array.isArray(base.fuelTrucks) ? base.fuelTrucks : [],
    fuelHauls: Array.isArray(base.fuelHauls) ? base.fuelHauls : [],
    internationalLanes: Array.isArray(lanesRaw)
      ? (lanesRaw as InternationalLane[])
      : [],
    ...(Array.isArray(portListingsRaw)
      ? { portListings: portListingsRaw as CareerEconomyWorld['portListings'] }
      : {}),
    ...(Array.isArray(portInventoriesRaw)
      ? {
          portInventories:
            portInventoriesRaw as CareerEconomyWorld['portInventories'],
        }
      : {}),
    ...(Array.isArray(portConcessionsRaw)
      ? {
          portConcessions:
            portConcessionsRaw as CareerEconomyWorld['portConcessions'],
        }
      : {}),
    ...(() => {
      const demandRaw = (base as { demandOrders?: unknown }).demandOrders;
      return Array.isArray(demandRaw)
        ? { demandOrders: demandRaw as CareerEconomyWorld['demandOrders'] }
        : {};
    })(),
  };

  remapMislabelledClHubs(migrated);
  remapRetiredCareerAirportIdents(migrated);
  pruneOrphanCareerHubs(migrated);
  ensureCareerHubCoverage(migrated);
  ensureInternationalLanes(migrated);
  ensureNpcFleet(migrated);
  migrateNpcTimestamps(migrated, Number.isFinite(version) ? version : 0);
  ensureWorldFuelInventory(migrated);
  ensureWorldMroInventory(migrated);
  ensureWorldSuppliesInventory(migrated);
  ensureWorldHubTiers(migrated);
  ensureFuelTruckFleet(migrated);
  ensureWorldHubLevels(migrated);
  ensureHomeCountryId(migrated);
  pruneDeadLots(migrated);

  return migrated;
}

/**
 * Advance the world by whole hours elapsed since lastBatchAtMs (1:1 batches),
 * and settle continuous NPC ops due at nowMs. Partial hours are preserved.
 */
export function ensureEconomyCaughtUp(
  world: CareerEconomyWorld | CareerEconomyWorldV1 | Record<string, unknown>,
  nowMs = Date.now(),
  opts: { maxTicks?: number } = {},
): { advancedTicks: number; settledFlights: number; world: CareerEconomyWorld } {
  const migrated = migrateEconomyWorld(world, { nowMs });
  const w = world as CareerEconomyWorld;
  w.version = 3;
  w.seed = migrated.seed;
  w.tick = migrated.tick;
  w.lastBatchAtMs = migrated.lastBatchAtMs;
  w.lastSyncedAtMs = migrated.lastBatchAtMs;
  w.airports = migrated.airports;
  w.lots = migrated.lots;
  w.events = migrated.events ?? [];
  w.npcs = migrated.npcs;
  w.npcFlights = migrated.npcFlights;
  w.fuelTrucks = migrated.fuelTrucks;
  w.fuelHauls = migrated.fuelHauls;
  w.homeCountryId = migrated.homeCountryId;
  w.internationalLanes = migrated.internationalLanes;
  if (migrated.portListings) {
    w.portListings = migrated.portListings;
  } else {
    delete w.portListings;
  }
  if (migrated.portInventories) {
    w.portInventories = migrated.portInventories;
  } else {
    delete w.portInventories;
  }
  if (migrated.portConcessions) {
    w.portConcessions = migrated.portConcessions;
  } else {
    delete w.portConcessions;
  }
  if (migrated.demandOrders) {
    w.demandOrders = migrated.demandOrders;
  } else {
    delete w.demandOrders;
  }

  // Mid-hour continuous ops first (arrivals between batches).
  let settledFlights = settleNpcOpsDue(w, nowMs).settledFlights;
  settledFlights += settleFuelHaulsDue(w, nowMs).settledHauls;

  let last = w.lastBatchAtMs;
  // Pulse --write / dry sweeps can leave lastBatchAtMs (and haul ETAs) days ahead
  // of wall clock. Snapping the anchor without shifting ops freezes tankers at 0%
  // with multi-day ETAs — pull the whole timeline back first.
  if (Number.isFinite(last) && last > nowMs) {
    shiftEconomyWallClock(w, nowMs - last);
    last = nowMs;
    w.lastBatchAtMs = nowMs;
    w.lastSyncedAtMs = nowMs;
  }

  const elapsed = Math.max(0, nowMs - last);
  const maxTicks = opts.maxTicks ?? MAX_CATCH_UP_TICKS;
  const hours = Math.min(maxTicks, Math.floor(elapsed / MS_PER_TICK));
  if (hours > 0) {
    tickEconomyN(w, hours, { advanceWallClock: true, fromBatchAtMs: last });
  }
  // Preserve fractional hour for the next batch boundary.
  w.lastBatchAtMs = nowMs - (elapsed % MS_PER_TICK);
  w.lastSyncedAtMs = w.lastBatchAtMs;

  settledFlights += settleNpcOpsDue(w, nowMs).settledFlights;
  settledFlights += settleFuelHaulsDue(w, nowMs).settledHauls;
  return { advancedTicks: hours, settledFlights, world: w };
}

function baseProdOf(ap: AirportTerminal, commodityId: CommodityId): number {
  return ap.baseProduction?.[commodityId] ?? ap.production[commodityId] ?? 0;
}

function baseConsOf(ap: AirportTerminal, commodityId: CommodityId): number {
  return ap.baseConsumption?.[commodityId] ?? ap.consumption[commodityId] ?? 0;
}

/** Day-of-year style season from tick (96 ticks ≈ 1 day). */
function seasonalFactor(commodityId: CommodityId, tick: number): number {
  const day = Math.floor(tick / TICKS_PER_DAY) % 365;
  const wave = Math.sin((2 * Math.PI * day) / 365);
  if (commodityId === 'perishables') {
    return 1 + wave * 0.18;
  }
  if (commodityId === 'electronics') {
    return 1 + wave * 0.06;
  }
  return 1 + wave * 0.04;
}

function activeEvents(world: CareerEconomyWorld, tick = world.tick): EconomyEvent[] {
  return (world.events ?? []).filter((e) => e.startsAtTick <= tick && tick < e.endsAtTick);
}

function eventTouchesCommodity(ev: EconomyEvent, commodityId: CommodityId): boolean {
  return !ev.commodityId || ev.commodityId === commodityId;
}

function eventMultiplier(
  world: CareerEconomyWorld,
  ap: AirportTerminal,
  commodityId: CommodityId,
  side: 'prod' | 'cons',
): number {
  let m = 1;
  for (const ev of activeEvents(world)) {
    if (ev.region !== ap.region) continue;
    if (!eventTouchesCommodity(ev, commodityId)) continue;
    switch (ev.kind) {
      case 'harvest_boost':
        if (side === 'prod' && (!ev.commodityId || ev.commodityId === 'perishables')) m *= 1.35;
        break;
      case 'factory_outage':
        if (
          side === 'prod' &&
          (!ev.commodityId ||
            ev.commodityId === 'electronics' ||
            ev.commodityId === 'machinery')
        ) {
          m *= 0.55;
        }
        break;
      case 'port_congestion':
        if (side === 'cons') m *= 0.85;
        if (side === 'prod') m *= 0.9;
        break;
      case 'festival_demand':
        if (side === 'cons') m *= 1.4;
        break;
      case 'labor_strike':
        if (side === 'prod') m *= 0.65;
        if (side === 'cons') m *= 0.8;
        break;
      default:
        break;
    }
  }
  return m;
}

/** Short chip label for a demand-shock kind. */
export function economyEventChipLabel(kind: EconomyEventKind): string {
  switch (kind) {
    case 'harvest_boost':
      return 'Harvest';
    case 'factory_outage':
      return 'Outage';
    case 'port_congestion':
      return 'Congestion';
    case 'festival_demand':
      return 'Festival';
    case 'labor_strike':
      return 'Strike';
    default:
      return 'Shock';
  }
}

export type LaneDemandShock = {
  payMult: number;
  forceUrgent: boolean;
  lifeMult: number;
  labels: string[];
  kinds: EconomyEventKind[];
};

/**
 * Freight-facing demand shocks for an OD lane.
 * Events on origin or dest (matching commodity) raise pay / urgency / shorten life.
 */
export function laneDemandShock(
  world: CareerEconomyWorld,
  opts: {
    originRegion: string;
    destRegion: string;
    commodityId: CommodityId;
    tick?: number;
    /** When set, skips re-filtering world.events (formLots hot path). */
    events?: readonly EconomyEvent[];
  },
): LaneDemandShock {
  const tick = opts.tick ?? world.tick;
  let payMult = 1;
  let forceUrgent = false;
  let lifeMult = 1;
  const labels: string[] = [];
  const kinds: EconomyEventKind[] = [];

  const events = opts.events ?? activeEvents(world, tick);
  for (const ev of events) {
    if (ev.region !== opts.originRegion && ev.region !== opts.destRegion) continue;
    if (!eventTouchesCommodity(ev, opts.commodityId)) continue;
    const atOrigin = ev.region === opts.originRegion;
    const atDest = ev.region === opts.destRegion;
    kinds.push(ev.kind);
    const chip = economyEventChipLabel(ev.kind);
    if (!labels.includes(chip)) labels.push(chip);

    switch (ev.kind) {
      case 'harvest_boost':
        // Origin surplus dump — slight pay bump to clear perishables.
        if (atOrigin) payMult *= 1.08;
        if (atDest) {
          payMult *= 1.05;
          lifeMult *= 0.92;
        }
        break;
      case 'festival_demand':
        if (atDest) {
          payMult *= 1.18;
          forceUrgent = true;
          lifeMult *= 0.9;
        }
        if (atOrigin) payMult *= 1.06;
        break;
      case 'factory_outage':
        if (atDest) {
          payMult *= 1.16;
          forceUrgent = true;
        }
        if (atOrigin) payMult *= 1.1;
        break;
      case 'port_congestion':
        payMult *= 1.1;
        lifeMult *= 0.88;
        if (atDest) forceUrgent = true;
        break;
      case 'labor_strike':
        payMult *= 1.14;
        lifeMult *= 0.85;
        forceUrgent = true;
        break;
      default:
        break;
    }
  }

  return {
    payMult: Math.min(1.45, payMult),
    forceUrgent,
    lifeMult: Math.max(0.7, lifeMult),
    labels,
    kinds,
  };
}

function maybeSpawnEvents(world: CareerEconomyWorld, rng: () => number): void {
  if (!world.events) world.events = [];
  // Drop finished events older than ~48 wall-hours (192 × 15-min ticks).
  world.events = world.events.filter(
    (e) => e.endsAtTick > world.tick - TICKS_PER_DAY * 2,
  );
  const active = activeEvents(world);
  if (active.length >= 4) return;
  // ~1.75%/15-min tick ≈ ~7%/hour — occasional overlapping shocks.
  if (rng() > 0.0175) return;

  const regions = [...new Set(world.airports.map((a) => a.region))];
  const region = regions[Math.floor(rng() * regions.length)] ?? 'BR-SE';
  const kinds: EconomyEventKind[] = [
    'harvest_boost',
    'port_congestion',
    'factory_outage',
    'festival_demand',
    'labor_strike',
  ];
  const kind = kinds[Math.floor(rng() * kinds.length)]!;
  const duration = 48 + Math.floor(rng() * 144);
  let commodityId: CommodityId | undefined;
  let label = '';
  switch (kind) {
    case 'harvest_boost':
      commodityId = 'perishables';
      label = `Harvest surge in ${region}`;
      break;
    case 'factory_outage':
      commodityId = rng() > 0.5 ? 'electronics' : 'machinery';
      label = `Factory outage (${commodityId}) in ${region}`;
      break;
    case 'port_congestion':
      label = `Port congestion in ${region}`;
      break;
    case 'festival_demand':
      commodityId = rng() > 0.5 ? 'general' : 'perishables';
      label = `Festival demand for ${commodityId} in ${region}`;
      break;
    case 'labor_strike':
      commodityId = rng() > 0.5 ? 'general' : 'machinery';
      label = `Labor strike slowing ${commodityId} in ${region}`;
      break;
  }
  world.events.push({
    id: `evt_${world.tick}_${kind}_${Math.floor(rng() * 1e6)}`,
    kind,
    region,
    commodityId,
    startsAtTick: world.tick,
    endsAtTick: world.tick + duration,
    label,
  });
}

/** Net flow trend for UI: rising / falling / stable. */
export function stockTrend(
  productionKg: number,
  consumptionKg: number,
): 'rising' | 'falling' | 'stable' {
  const net = productionKg - consumptionKg;
  // Per 15-min tick thresholds (legacy ±80 kg/hour ÷ 4).
  if (net > 20) return 'rising';
  if (net < -20) return 'falling';
  return 'stable';
}

export function listActiveEconomyEvents(
  world: CareerEconomyWorld,
  opts: { region?: string; icao?: string } = {},
): EconomyEvent[] {
  let region = opts.region;
  if (!region && opts.icao) {
    region = world.airports.find((a) => a.icao === opts.icao?.toUpperCase())?.region;
  }
  return activeEvents(world).filter((e) => !region || e.region === region);
}

function airportMap(world: CareerEconomyWorld): Map<string, AirportTerminal> {
  return new Map(world.airports.map((a) => [a.icao, a]));
}

/**
 * Apply a freight delivery to terminal stocks.
 *
 * Formation already debited LOT_FORMATION_RESERVE_FRACTION of this cargo from
 * origin (see `pushLot`), so delivery only draws the remainder. Drawing the
 * full `kg` here double-charged the origin and made every lot a mass sink.
 */
export function applyFreightDelivery(
  world: CareerEconomyWorld,
  opts: {
    commodityId: CommodityId;
    originIcao: string;
    destIcao: string;
    kg: number;
  },
): { removedFromOriginKg: number; addedToDestKg: number; originStockKg: number; destStockKg: number } {
  const byIcao = airportMap(world);
  const origin = byIcao.get(opts.originIcao.toUpperCase());
  const dest = byIcao.get(opts.destIcao.toUpperCase());
  if (!origin) {
    throw new Error(`Unknown origin airport: ${opts.originIcao}`);
  }
  if (!dest) {
    throw new Error(`Unknown destination airport: ${opts.destIcao}`);
  }

  const qty = Math.max(0, Math.floor(opts.kg));
  const oStock = ensurePile(origin, opts.commodityId);
  const dStock = ensurePile(dest, opts.commodityId);
  const originDrawKg = Math.round(qty * (1 - LOT_FORMATION_RESERVE_FRACTION));
  const removedFromOriginKg = Math.min(originDrawKg, oStock.stockKg);
  noteLotDelivered(world, opts.commodityId, qty);
  oStock.stockKg = clamp(oStock.stockKg - removedFromOriginKg, 0, oStock.capacityKg);
  const room = Math.max(0, dStock.capacityKg - dStock.stockKg);
  const addedToDestKg = Math.min(qty, room);
  dStock.stockKg = clamp(dStock.stockKg + addedToDestKg, 0, dStock.capacityKg);
  noteDeliveryStock(world, removedFromOriginKg, addedToDestKg);
  if (addedToDestKg > 0 || removedFromOriginKg > 0) {
    recordFreightSettleActivity(world, opts.originIcao, opts.destIcao);
  }
  return {
    removedFromOriginKg,
    addedToDestKg,
    originStockKg: oStock.stockKg,
    destStockKg: dStock.stockKg,
  };
}

function applyProductionConsumption(world: CareerEconomyWorld, rng: () => number): void {
  for (const ap of world.airports) {
    if (ap.bushTripOnly === true || isBushTripOnlyHub(ap.icao)) {
      freezeBushTripOnlyTerminal(ap);
      continue;
    }
    if (!ap.baseProduction) ap.baseProduction = { ...(ap.production ?? {}) };
    if (!ap.baseConsumption) ap.baseConsumption = { ...(ap.consumption ?? {}) };

    for (const c of CAREER_COMMODITIES) {
      const stock = ensurePile(ap, c.id);
      const fill = fillPct(stock);
      const baseProd = baseProdOf(ap, c.id);
      const baseCons = baseConsOf(ap, c.id);

      // Production nearly stops at a full warehouse instead of creating a
      // permanent 100%-fill pressure source.
      const prodSaturation = fill >= 0.7 ? 1 - ((fill - 0.7) / 0.3) * 0.95 : 1;
      const consStarvation = fill <= 0.15 ? Math.max(0.15, fill / 0.15) : 1;
      const season = seasonalFactor(c.id, world.tick);
      const noise = 0.88 + rng() * 0.24;
      const evProd = eventMultiplier(world, ap, c.id, 'prod');
      const evCons = eventMultiplier(world, ap, c.id, 'cons');

      const health = hubLevelHealthMult(ap);
      const bal = cargoFlowBalance(c.id);
      const prod = Math.max(
        0,
        Math.round(
          baseProd *
            prodSaturation *
            season *
            evProd *
            noise *
            health *
            bal.production,
        ),
      );
      const cons = Math.max(
        0,
        Math.round(
          baseCons *
            consStarvation *
            season *
            evCons *
            (0.9 + rng() * 0.2) *
            health *
            bal.consumption,
        ),
      );

      ap.production[c.id] = prod;
      ap.consumption[c.id] = cons;
      // Effective rates (prodSaturation / consStarvation already applied). Kept
      // separate so the pulse can tell whether a shelf saturates from too much
      // production or too little consumption — the Dry-saturation diagnostic.
      if (c.kind !== 'fuel' && c.kind !== 'mro') {
        noteWarehouseFlow(world, c.id, prod, cons);
      }
      stock.stockKg = clamp(stock.stockKg + prod - cons, 0, stock.capacityKg);
    }
  }
}

/** Keep expired/delivered lots this many ticks after expiresAtTick, then drop (~12h). */
export const DEAD_LOT_RETENTION_TICKS = 48;

/**
 * Drop market lots that are no longer actionable.
 * Keeps available / reserved / in_transit always; expired & delivered only briefly.
 * Does not touch player missions / logbook (separate file).
 */
export function pruneDeadLots(
  world: CareerEconomyWorld,
  opts: { retentionTicks?: number } = {},
): { removed: number; kept: number } {
  const retention = Math.max(
    0,
    Math.floor(opts.retentionTicks ?? DEAD_LOT_RETENTION_TICKS),
  );
  const keepFrom = world.tick - retention;
  const before = world.lots.length;
  world.lots = world.lots.filter((lot) => {
    if (
      lot.status === 'available' ||
      lot.status === 'reserved' ||
      lot.status === 'in_transit'
    ) {
      return true;
    }
    // expired | delivered — retain only a short window for debugging
    return (
      typeof lot.expiresAtTick === 'number' && lot.expiresAtTick >= keepFrom
    );
  });

  // Drop orphan/stale player inbound so soft-fill cannot linger forever.
  if (Array.isArray(world.inboundPending) && world.inboundPending.length > 0) {
    world.inboundPending = world.inboundPending.filter(
      (pending) =>
        typeof pending.expiresAtTick === 'number' &&
        pending.expiresAtTick >= keepFrom,
    );
  }

  return { removed: before - world.lots.length, kept: world.lots.length };
}

/**
 * Retire an available lot and return its formation reserve to origin stock.
 * Only the unclaimed remainder is refunded — delivered cargo already drew the
 * rest at settle. Single transition point so nothing refunds twice.
 */
function retireLotToOrigin(
  world: CareerEconomyWorld,
  lot: ShipmentLot,
  reason: 'expired' | 'recycled',
): number {
  if (lot.status !== 'available') return 0;
  const unclaimedKg = Math.max(0, lot.quantityKg - lot.reservedKg);
  lot.status = 'expired';

  const refundKg = Math.round(unclaimedKg * LOT_FORMATION_RESERVE_FRACTION);
  const origin = airportByIcao(world, lot.originIcao);
  if (origin && refundKg > 0) {
    const pile = ensurePile(origin, lot.commodityId);
    pile.stockKg = clamp(pile.stockKg + refundKg, 0, pile.capacityKg);
    noteReserveRefund(world, refundKg);
  }

  if (reason === 'recycled') {
    noteLotRecycled(world, lot.commodityId, unclaimedKg);
  } else {
    noteLotExpired(
      world,
      lot.commodityId,
      unclaimedKg,
      flowSizeBand(
        lot.quantityKg,
        lot.quantityKg >= XL_LOT_MIN_KG
          ? 'xl'
          : lot.quantityKg >= 4_000
            ? 'large'
            : 'small',
      ),
    );
  }
  return refundKg;
}

function expireLots(world: CareerEconomyWorld): void {
  for (const lot of world.lots) {
    // Only unbooked market remainder expires. Reserved / in_transit cargo is
    // owned by holds or airborne missions until settle / FBO expire paths run.
    if (lot.status !== 'available') continue;
    if (lot.reservedKg > 0) continue;
    if (world.tick >= lot.expiresAtTick) {
      retireLotToOrigin(world, lot, 'expired');
    }
  }
  pruneDeadLots(world);
}

/**
 * Grace fraction of lot life before idle pay starts rising.
 * After that, pay ramps linearly to IDLE_LOT_PAY_MAX_MULT at expiry.
 */
export const IDLE_LOT_ESCALATION_START = 0.25;
/** Max pay multiplier vs formation base for LTL + perishables. */
export const IDLE_LOT_PAY_MAX_MULT = 1.4;
/** Large electronics/machinery — pulse showed p50 doubling with falling fill. */
export const IDLE_LOT_PAY_MAX_MULT_HEAVY = 1.15;
/** Other large bulk (general/supplies). */
export const IDLE_LOT_PAY_MAX_MULT_BULK = 1.25;
/** Life progress at which a lingering lot flips to urgent. */
export const IDLE_LOT_URGENT_PROGRESS = 0.55;

/** Idle ceiling for this lot: full ramp on LTL/perishables only. */
export function idleLotPayMaxMultForLot(
  lot: Pick<ShipmentLot, 'commodityId' | 'quantityKg'>,
): number {
  if (lot.commodityId === 'perishables') return IDLE_LOT_PAY_MAX_MULT;
  if (lot.quantityKg <= SMALL_LOT_MAX_KG) return IDLE_LOT_PAY_MAX_MULT;
  if (lot.commodityId === 'electronics' || lot.commodityId === 'machinery') {
    return IDLE_LOT_PAY_MAX_MULT_HEAVY;
  }
  return IDLE_LOT_PAY_MAX_MULT_BULK;
}

/** Flow-instrumentation bucket for a formed lot. */
function flowSizeBand(
  qty: number,
  size: 'xl' | 'large' | 'small',
): FlowLotSizeBand {
  if (size === 'xl') return 'xl';
  if (size === 'large') return 'large';
  return qty <= GA_LTL_MAX_KG ? 'ga_ltl' : 'ltl';
}

/** Life progress of a lot at `tick` (0 at create, 1 at expiry). */
export function idleLotLifeProgress(
  lot: Pick<ShipmentLot, 'createdAtTick' | 'expiresAtTick'>,
  tick: number,
): number {
  const life = Math.max(1, lot.expiresAtTick - lot.createdAtTick);
  const age = Math.max(0, tick - lot.createdAtTick);
  return Math.min(1, age / life);
}

/**
 * Idle freight multiplier from formation base (≥ 1).
 * No boost for the first IDLE_LOT_ESCALATION_START of life, then ramps to max.
 */
export function idleLotPayMult(
  lot: Pick<
    ShipmentLot,
    'createdAtTick' | 'expiresAtTick' | 'commodityId' | 'quantityKg'
  >,
  tick: number,
): number {
  const progress = idleLotLifeProgress(lot, tick);
  if (progress <= IDLE_LOT_ESCALATION_START) return 1;
  const t =
    (progress - IDLE_LOT_ESCALATION_START) / (1 - IDLE_LOT_ESCALATION_START);
  const maxMult = idleLotPayMaxMultForLot(lot);
  return 1 + (maxMult - 1) * t;
}

/**
 * Raise pay on lingering available lots from stamped basePayUsd.
 * Also flips urgency late in life so the board shows the pressure.
 */
export function escalateIdleLots(world: CareerEconomyWorld): {
  escalated: number;
  markedUrgent: number;
} {
  let escalated = 0;
  let markedUrgent = 0;
  for (const lot of world.lots) {
    if (lot.status !== 'available' && lot.status !== 'reserved') continue;
    if (typeof lot.basePayUsd !== 'number' || !Number.isFinite(lot.basePayUsd)) {
      lot.basePayUsd = lot.payUsd;
    }
    const mult = idleLotPayMult(lot, world.tick);
    const nextPay = Math.max(1, Math.round(lot.basePayUsd * mult));
    if (mult > 1 && nextPay !== lot.payUsd) escalated += 1;
    lot.payUsd = nextPay;
    if (
      lot.urgency === 'normal' &&
      idleLotLifeProgress(lot, world.tick) >= IDLE_LOT_URGENT_PROGRESS
    ) {
      lot.urgency = 'urgent';
      markedUrgent += 1;
    }
  }
  return { escalated, markedUrgent };
}

function availableKg(lot: ShipmentLot): number {
  if (lot.status !== 'available' && lot.status !== 'reserved') {
    return 0;
  }
  return Math.max(0, lot.quantityKg - lot.reservedKg);
}

function fillPct(stock: StockPile): number {
  return stock.capacityKg > 0 ? stock.stockKg / stock.capacityKg : 0;
}

function laneKey(commodityId: CommodityId, origin: string, dest: string): string {
  return `${commodityId}:${origin}:${dest}`;
}

function sizeSmallLotKg(
  qty: number,
  originTier: HubTier,
  destTier: HubTier,
  rng: () => number,
  nm?: number,
): number {
  const spokeOd = originTier === 'spoke' || destTier === 'spoke';
  const gaInRange = nm == null || nm <= GA_LTL_MAX_NM;
  const wantGa = gaInRange && (spokeOd || rng() < 0.4);
  if (wantGa) {
    const hi = Math.min(GA_LTL_MAX_KG, Math.max(SMALL_LOT_MIN_KG, qty));
    const steps = Math.max(0, Math.floor((hi - SMALL_LOT_MIN_KG) / 10));
    return Math.max(
      SMALL_LOT_MIN_KG,
      Math.min(hi, SMALL_LOT_MIN_KG + Math.floor(rng() * (steps + 1)) * 10),
    );
  }
  const feederMin = gaInRange
    ? FEEDER_LTL_MIN_KG
    : Math.max(FEEDER_LTL_MIN_KG, GA_LTL_MAX_KG + 50);
  const smallQty = Math.min(qty, SMALL_LOT_MAX_KG);
  return Math.max(
    feederMin,
    Math.min(smallQty, feederMin + Math.floor(rng() * 17) * 100),
  );
}

export const INTL_BOARD_PARTITION = 'INTL';

function countryByIcaoMap(
  world: CareerEconomyWorld,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const ap of world.airports) {
    const id = countryIdFromRegion(ap.region ?? '');
    if (id) map.set(ap.icao.toUpperCase(), id);
  }
  return map;
}

export function lotBoardPartition(
  lot: Pick<ShipmentLot, 'originIcao' | 'destIcao'>,
  countryByIcao: ReadonlyMap<string, string>,
): string {
  const origin = countryByIcao.get(lot.originIcao.trim().toUpperCase()) ?? '';
  const dest = countryByIcao.get(lot.destIcao.trim().toUpperCase()) ?? '';
  if (origin && dest && origin !== dest) return INTL_BOARD_PARTITION;
  return origin || dest || 'XX';
}

function partitionKey(commodityId: CommodityId, partitionId: string): string {
  return `${commodityId}:${partitionId}`;
}

export function intlCommodityQuota(): number {
  return Math.max(
    80,
    Math.round(COMMODITY_AVAILABLE_SOFT_CAP * INTL_AVAILABLE_SHARE),
  );
}

/** Available-lot quota for one commodity in a country or INTL. */
export function partitionAvailableQuota(
  world: CareerEconomyWorld,
  partitionId: string,
): number {
  if (partitionId === INTL_BOARD_PARTITION) return intlCommodityQuota();
  const totalHubs = Math.max(1, world.airports.length);
  const countryHubs = world.airports.filter(
    (ap) => countryIdFromRegion(ap.region ?? '') === partitionId,
  ).length;
  const pool = Math.max(0, COMMODITY_AVAILABLE_SOFT_CAP - intlCommodityQuota());
  return Math.max(
    COUNTRY_AVAILABLE_FLOOR,
    Math.round((pool * countryHubs) / totalHubs),
  );
}

function partitionLargeQuota(
  world: CareerEconomyWorld,
  partitionId: string,
  commodityId: CommodityId,
): number | undefined {
  const largeCap = COMMODITY_LARGE_AVAILABLE_SOFT_CAP[commodityId];
  if (largeCap == null) return undefined;
  const availCap = partitionAvailableQuota(world, partitionId);
  return Math.max(
    20,
    Math.round((largeCap * availCap) / COMMODITY_AVAILABLE_SOFT_CAP),
  );
}

type AvailableLotCounts = {
  total: number;
  byCommodity: Map<CommodityId, number>;
  largeByCommodity: Map<CommodityId, number>;
  byCommodityPartition: Map<string, number>;
  largeByCommodityPartition: Map<string, number>;
  /** Open (unreserved) kg on the board per partition. */
  kgByPartition: Map<string, number>;
  /** Open kg from large/XL lots only, per partition. */
  heavyKgByPartition: Map<string, number>;
};

function countAvailableLots(
  world: CareerEconomyWorld,
  countryByIcao: ReadonlyMap<string, string>,
): AvailableLotCounts {
  const byCommodity = new Map<CommodityId, number>();
  const largeByCommodity = new Map<CommodityId, number>();
  const byCommodityPartition = new Map<string, number>();
  const largeByCommodityPartition = new Map<string, number>();
  const kgByPartition = new Map<string, number>();
  const heavyKgByPartition = new Map<string, number>();
  let total = 0;
  for (const lot of world.lots) {
    if (lot.status !== 'available') continue;
    total += 1;
    byCommodity.set(lot.commodityId, (byCommodity.get(lot.commodityId) ?? 0) + 1);
    const partitionId = lotBoardPartition(lot, countryByIcao);
    const openKg = Math.max(0, lot.quantityKg - lot.reservedKg);
    kgByPartition.set(partitionId, (kgByPartition.get(partitionId) ?? 0) + openKg);
    const pKey = partitionKey(lot.commodityId, partitionId);
    byCommodityPartition.set(pKey, (byCommodityPartition.get(pKey) ?? 0) + 1);
    if (lot.quantityKg >= 4_000) {
      largeByCommodity.set(
        lot.commodityId,
        (largeByCommodity.get(lot.commodityId) ?? 0) + 1,
      );
      largeByCommodityPartition.set(
        pKey,
        (largeByCommodityPartition.get(pKey) ?? 0) + 1,
      );
      heavyKgByPartition.set(
        partitionId,
        (heavyKgByPartition.get(partitionId) ?? 0) + openKg,
      );
    }
  }
  return {
    total,
    byCommodity,
    largeByCommodity,
    byCommodityPartition,
    largeByCommodityPartition,
    kgByPartition,
    heavyKgByPartition,
  };
}

function noteAvailableLot(
  counts: AvailableLotCounts,
  commodityId: CommodityId,
  partitionId: string,
  qty: number,
  delta: 1 | -1,
): void {
  counts.total += delta;
  counts.kgByPartition.set(
    partitionId,
    Math.max(0, (counts.kgByPartition.get(partitionId) ?? 0) + delta * qty),
  );
  counts.byCommodity.set(
    commodityId,
    Math.max(0, (counts.byCommodity.get(commodityId) ?? 0) + delta),
  );
  const pKey = partitionKey(commodityId, partitionId);
  counts.byCommodityPartition.set(
    pKey,
    Math.max(0, (counts.byCommodityPartition.get(pKey) ?? 0) + delta),
  );
  if (qty >= 4_000) {
    counts.largeByCommodity.set(
      commodityId,
      Math.max(0, (counts.largeByCommodity.get(commodityId) ?? 0) + delta),
    );
    counts.largeByCommodityPartition.set(
      pKey,
      Math.max(0, (counts.largeByCommodityPartition.get(pKey) ?? 0) + delta),
    );
    counts.heavyKgByPartition.set(
      partitionId,
      Math.max(0, (counts.heavyKgByPartition.get(partitionId) ?? 0) + delta * qty),
    );
  }
}

/**
 * Days of transport capacity the board is allowed to hold as open freight.
 *
 * Dry lots live ~18–26h (perishables less). Holding four days of work against
 * a one-day life guaranteed a cemetery — expire:deliver sat near 7:1 even
 * after the kg target landed. Cover ≈ lot life so the shelf is what the
 * fleet can actually fly before the contracts age out.
 */
export const BOARD_COVER_DAYS = 1.5;
/** Floor so a thin-fleet partition still shows a board. */
export const PARTITION_MIN_BOARD_KG = 120_000;
/** Floor so Narrow/Wide always have something to bid on. */
export const PARTITION_MIN_HEAVY_BOARD_KG = 80_000;

/**
 * Open kg the board may hold for a partition before formation backs off.
 * `heavyOnly` returns the slice reserved for large/XL freight, sized from the
 * Narrow/Wide share of local lift so the board mirrors the fleet it feeds.
 */
export function partitionBoardKgTarget(
  world: CareerEconomyWorld,
  partitionId: string,
  opts: { heavyOnly?: boolean } = {},
): number {
  const heavyOnly = opts.heavyOnly === true;
  const floor = heavyOnly
    ? PARTITION_MIN_HEAVY_BOARD_KG
    : PARTITION_MIN_BOARD_KG;
  if (partitionId === INTL_BOARD_PARTITION) {
    // International rides on the same fleets; give it the INTL board share.
    const domestic = listWorldCountryIds(world).reduce(
      (sum, id) => sum + partitionLiftableKgPerDay(world, id, { heavyOnly }),
      0,
    );
    return Math.max(
      floor,
      domestic * INTL_AVAILABLE_SHARE * BOARD_COVER_DAYS,
    );
  }
  return Math.max(
    floor,
    partitionLiftableKgPerDay(world, partitionId, { heavyOnly }) *
      BOARD_COVER_DAYS,
  );
}

function commodityBoardBloated(
  world: CareerEconomyWorld,
  counts: AvailableLotCounts,
  commodityId: CommodityId,
  partitionId: string,
): { skipHeavy: boolean; skipAll: boolean } {
  const quota = partitionAvailableQuota(world, partitionId);
  const n =
    counts.byCommodityPartition.get(partitionKey(commodityId, partitionId)) ?? 0;
  const largeQuota = partitionLargeQuota(world, partitionId, commodityId);
  const largeN =
    counts.largeByCommodityPartition.get(
      partitionKey(commodityId, partitionId),
    ) ?? 0;
  let skipAll = n >= quota;
  if (
    counts.total >= BOARD_AVAILABLE_SOFT_CAP &&
    n >= Math.ceil(quota * 0.9)
  ) {
    skipAll = true;
  }

  // Transport capacity, not shelf space, is the real ceiling. Heavy freight
  // gets its own slice sized from local Narrow/Wide lift, so LTL cannot crowd
  // out the trunk market and heavy blocks cannot bury the GA board.
  const boardKg = counts.kgByPartition.get(partitionId) ?? 0;
  if (boardKg >= partitionBoardKgTarget(world, partitionId)) skipAll = true;

  const heavyKg = counts.heavyKgByPartition.get(partitionId) ?? 0;
  const heavyOverCapacity =
    heavyKg >= partitionBoardKgTarget(world, partitionId, { heavyOnly: true });

  const skipHeavy =
    skipAll || heavyOverCapacity || (largeQuota != null && largeN >= largeQuota);
  return { skipHeavy, skipAll };
}

function recycleStaleLargeLots(
  world: CareerEconomyWorld,
  countryByIcao: ReadonlyMap<string, string>,
  counts: AvailableLotCounts,
  activeCounts: Map<string, number>,
  xlCounts: Map<string, number>,
  largeCounts: Map<string, number>,
): number {
  const recycledByCommodity = new Map<CommodityId, number>();
  const stale: ShipmentLot[] = [];
  for (const lot of world.lots) {
    if (lot.status !== 'available' || lot.reservedKg > 0) continue;
    if (lot.quantityKg < 4_000) continue;
    // Only the heavy shelf that froze in the 30d pulse (electronics/machinery).
    // General/bulk keep idle-pay escalation as the living signal.
    if (COMMODITY_LARGE_AVAILABLE_SOFT_CAP[lot.commodityId] == null) continue;
    const progress = idleLotLifeProgress(lot, world.tick);
    if (progress < STALE_LARGE_RECYCLE_PROGRESS) continue;
    const partitionId = lotBoardPartition(lot, countryByIcao);
    const largeQuota = partitionLargeQuota(world, partitionId, lot.commodityId);
    const largeN =
      counts.largeByCommodityPartition.get(
        partitionKey(lot.commodityId, partitionId),
      ) ?? 0;
    const crowded =
      largeQuota != null && largeN >= Math.ceil(largeQuota * 0.5);
    // Crowded shelf turns over from 40% life; thin markets wait until 70%.
    if (!crowded && progress < 0.7) continue;
    stale.push(lot);
  }
  stale.sort(
    (a, b) =>
      idleLotLifeProgress(b, world.tick) - idleLotLifeProgress(a, world.tick),
  );

  let recycled = 0;
  for (const lot of stale) {
    const used = recycledByCommodity.get(lot.commodityId) ?? 0;
    if (used >= STALE_LARGE_RECYCLE_MAX_PER_COMMODITY) continue;
    retireLotToOrigin(world, lot, 'recycled');
    const key = laneKey(lot.commodityId, lot.originIcao, lot.destIcao);
    activeCounts.set(key, Math.max(0, (activeCounts.get(key) ?? 0) - 1));
    if (lot.quantityKg >= XL_LOT_MIN_KG) {
      xlCounts.set(key, Math.max(0, (xlCounts.get(key) ?? 0) - 1));
    } else {
      largeCounts.set(key, Math.max(0, (largeCounts.get(key) ?? 0) - 1));
    }
    noteAvailableLot(
      counts,
      lot.commodityId,
      lotBoardPartition(lot, countryByIcao),
      lot.quantityKg,
      -1,
    );
    recycledByCommodity.set(lot.commodityId, used + 1);
    recycled += 1;
  }
  return recycled;
}

function isLastMileLot(lot: Pick<ShipmentLot, 'reason'>): boolean {
  return /last-mile/i.test(lot.reason);
}

/**
 * Pull unclaimed GA-LTL / LTL before they expire so expire:deliver is not a
 * cemetery of hops nobody lifted. Last-mile waits longer than feeder LTL.
 */
function recycleStaleSmallLots(
  world: CareerEconomyWorld,
  countryByIcao: ReadonlyMap<string, string>,
  counts: AvailableLotCounts,
  activeCounts: Map<string, number>,
  smallCounts: Map<string, number>,
): number {
  const recycledByCommodity = new Map<CommodityId, number>();
  const lastMileOpen = new Map<string, number>();
  for (const lot of world.lots) {
    if (lot.status !== 'available' || lot.reservedKg > 0) continue;
    if (!isLastMileLot(lot)) continue;
    const originKey = `${lot.originIcao.trim().toUpperCase()}|${lot.commodityId}`;
    lastMileOpen.set(originKey, (lastMileOpen.get(originKey) ?? 0) + 1);
  }

  const stale: ShipmentLot[] = [];
  for (const lot of world.lots) {
    if (lot.status !== 'available' || lot.reservedKg > 0) continue;
    if (lot.quantityKg >= 4_000) continue;
    const progress = idleLotLifeProgress(lot, world.tick);
    const lastMile = isLastMileLot(lot);
    const floor = lastMile
      ? STALE_LAST_MILE_RECYCLE_PROGRESS
      : STALE_SMALL_RECYCLE_PROGRESS;
    if (progress < floor) continue;
    const key = laneKey(lot.commodityId, lot.originIcao, lot.destIcao);
    const crowded = lastMile
      ? (lastMileOpen.get(
          `${lot.originIcao.trim().toUpperCase()}|${lot.commodityId}`,
        ) ?? 0) >= LAST_MILE_OPEN_LOTS_PER_ORIGIN
      : (smallCounts.get(key) ?? 0) >= MAX_SMALL_LOTS_PER_LANE;
    const thinFloor = lastMile
      ? STALE_LAST_MILE_RECYCLE_THIN_PROGRESS
      : STALE_SMALL_RECYCLE_THIN_PROGRESS;
    if (!crowded && progress < thinFloor) continue;
    stale.push(lot);
  }
  stale.sort((a, b) => {
    const aLast = isLastMileLot(a) ? 1 : 0;
    const bLast = isLastMileLot(b) ? 1 : 0;
    if (aLast !== bLast) return aLast - bLast;
    return (
      idleLotLifeProgress(b, world.tick) - idleLotLifeProgress(a, world.tick)
    );
  });

  let recycled = 0;
  for (const lot of stale) {
    const used = recycledByCommodity.get(lot.commodityId) ?? 0;
    if (used >= STALE_SMALL_RECYCLE_MAX_PER_COMMODITY) continue;
    retireLotToOrigin(world, lot, 'recycled');
    const key = laneKey(lot.commodityId, lot.originIcao, lot.destIcao);
    activeCounts.set(key, Math.max(0, (activeCounts.get(key) ?? 0) - 1));
    smallCounts.set(key, Math.max(0, (smallCounts.get(key) ?? 0) - 1));
    if (isLastMileLot(lot)) {
      const originKey = `${lot.originIcao.trim().toUpperCase()}|${lot.commodityId}`;
      lastMileOpen.set(
        originKey,
        Math.max(0, (lastMileOpen.get(originKey) ?? 0) - 1),
      );
    }
    noteAvailableLot(
      counts,
      lot.commodityId,
      lotBoardPartition(lot, countryByIcao),
      lot.quantityKg,
      -1,
    );
    recycledByCommodity.set(lot.commodityId, used + 1);
    recycled += 1;
  }
  return recycled;
}

type RankedAirport = {
  ap: AirportTerminal;
  stock: StockPile;
  fill: number;
  price: number;
  surplusKg: number;
  roomKg: number;
  tier: HubTier;
};

/**
 * Form shipment lots from surplus→shortage pairs.
 * Domestic passes are per country; cross-country only via internationalLanes.
 */
function formLotsFromImbalances(
  world: CareerEconomyWorld,
  rng: () => number,
): PartitionTickResult[] {
  ensureInternationalLanes(world);
  // Warm lane inbound index once for this tick's saturation / soft-fill reads.
  ensureLaneInboundIndex(world);

  const countryByIcao = countryByIcaoMap(world);
  const activeCounts = new Map<string, number>();
  const xlCounts = new Map<string, number>();
  const largeCounts = new Map<string, number>();
  const smallCounts = new Map<string, number>();
  const availableCounts = countAvailableLots(world, countryByIcao);
  /** Undirected OD → active lot kg (same semantics as activeLaneKg). */
  const activeLaneKgByOd = new Map<string, number>();
  const undirectedOdKey = (a: string, b: string): string => {
    const o = a.trim().toUpperCase();
    const d = b.trim().toUpperCase();
    return o < d ? `${o}|${d}` : `${d}|${o}`;
  };
  const activeKgOnOd = (originIcao: string, destIcao: string): number =>
    activeLaneKgByOd.get(undirectedOdKey(originIcao, destIcao)) ?? 0;

  for (const l of world.lots) {
    if (l.status !== 'available' && l.status !== 'reserved' && l.status !== 'in_transit') {
      continue;
    }
    const key = laneKey(l.commodityId, l.originIcao, l.destIcao);
    activeCounts.set(key, (activeCounts.get(key) ?? 0) + 1);
    if (l.quantityKg >= XL_LOT_MIN_KG) {
      xlCounts.set(key, (xlCounts.get(key) ?? 0) + 1);
    } else if (l.quantityKg >= 4_000) {
      largeCounts.set(key, (largeCounts.get(key) ?? 0) + 1);
    } else {
      smallCounts.set(key, (smallCounts.get(key) ?? 0) + 1);
    }
  }
  recycleStaleLargeLots(
    world,
    countryByIcao,
    availableCounts,
    activeCounts,
    xlCounts,
    largeCounts,
  );
  recycleStaleSmallLots(
    world,
    countryByIcao,
    availableCounts,
    activeCounts,
    smallCounts,
  );

  // After recycle so active OD kg matches the live board.
  for (const l of world.lots) {
    if (l.status !== 'available' && l.status !== 'reserved' && l.status !== 'in_transit') {
      continue;
    }
    const odKey = undirectedOdKey(l.originIcao, l.destIcao);
    activeLaneKgByOd.set(odKey, (activeLaneKgByOd.get(odKey) ?? 0) + l.quantityKg);
  }

  const formedByPartition = new Map<string, number>();
  const bumpFormed = (partitionId: string, n = 1) => {
    formedByPartition.set(partitionId, (formedByPartition.get(partitionId) ?? 0) + n);
  };

  const batchNowMs = world.lastBatchAtMs ?? Date.now();
  const regionCapacityCache = new Map<string, number>();
  const regionCapacity = (region: string): number => {
    let cached = regionCapacityCache.get(region);
    if (cached === undefined) {
      cached = npcRegionBidCapacity(world, region, batchNowMs);
      regionCapacityCache.set(region, cached);
    }
    return cached;
  };

  const airportsByCountry = new Map<string, AirportTerminal[]>();
  for (const ap of world.airports) {
    const id = countryIdFromRegion(ap.region);
    const list = airportsByCountry.get(id);
    if (list) list.push(ap);
    else airportsByCountry.set(id, [ap]);
  }

  const tickEvents = activeEvents(world, world.tick);
  const weatherByRegion = new Map<string, ReturnType<typeof regionalWeatherIndex>>();
  const regionWeather = (region: string) => {
    let wx = weatherByRegion.get(region);
    if (wx === undefined) {
      wx = regionalWeatherIndex(world, region);
      weatherByRegion.set(region, wx);
    }
    return wx;
  };
  const shockCache = new Map<string, LaneDemandShock>();
  const demandShock = (
    originRegion: string,
    destRegion: string,
    commodityId: CommodityId,
  ): LaneDemandShock => {
    const key = `${originRegion}|${destRegion}|${commodityId}`;
    let shock = shockCache.get(key);
    if (!shock) {
      shock = laneDemandShock(world, {
        originRegion,
        destRegion,
        commodityId,
        events: tickEvents,
      });
      shockCache.set(key, shock);
    }
    return shock;
  };
  const boardPressureCache = new Map<
    string,
    { skipHeavy: boolean; skipAll: boolean }
  >();
  const boardPressureOf = (commodityId: CommodityId, partitionId: string) => {
    const key = `${commodityId}:${partitionId}`;
    let pressure = boardPressureCache.get(key);
    if (!pressure) {
      pressure = commodityBoardBloated(
        world,
        availableCounts,
        commodityId,
        partitionId,
      );
      boardPressureCache.set(key, pressure);
    }
    return pressure;
  };
  const invalidateBoardPressure = (
    commodityId: CommodityId,
    partitionId: string,
  ) => {
    boardPressureCache.delete(`${commodityId}:${partitionId}`);
  };

  const pushLot = (
    key: string,
    commodity: (typeof CAREER_COMMODITIES)[number],
    origin: RankedAirport,
    dest: RankedAirport,
    qty: number,
    size: 'xl' | 'large' | 'small',
    laneSaturation: number,
    inboundKg: number,
    corridorW: number,
    opts: {
      international: boolean;
      partitionId: string;
      capacityKgPerDay?: number;
      /** Floor on (dest − origin) price used for pay, as a fraction of base. */
      minPayGapMult?: number;
      lastMile?: boolean;
    },
  ): boolean => {
    if (opts.capacityKgPerDay != null && opts.capacityKgPerDay > 0) {
      const activeKg = activeKgOnOd(origin.ap.icao, dest.ap.icao);
      if (activeKg + qty > opts.capacityKgPerDay) {
        return false;
      }
    }

    const international = opts.international;
    const originWx = regionWeather(origin.ap.region);
    const destWx = regionWeather(dest.ap.region);
    const laneWeather = worseWeather(originWx, destWx);
    const shock = demandShock(origin.ap.region, dest.ap.region, commodity.id);
    const destCap = dest.stock.capacityKg;
    const effectiveDestFill =
      destCap > 0 ? (dest.stock.stockKg + inboundKg) / destCap : dest.fill;
    const urgent =
      shock.forceUrgent ||
      effectiveDestFill < 0.22 ||
      commodity.perishable === true ||
      (dest.fill < 0.28 && inboundKg < 1_000) ||
      laneSaturation >= 0.5 ||
      (laneWeather === 'poor' && dest.fill < 0.35);
    const urgencyMult = urgent ? 1.35 : 1;
    const distanceBias = international
      ? INTERNATIONAL_DISTANCE_BIAS
      : origin.ap.region === dest.ap.region
        ? 1
        : 1.12;
    const corridorPayMult = 1 + Math.max(0, corridorW - 1) * 0.1;
    // RankedAirport.stock is the live pile reference (same as ensurePile).
    const rawGap =
      localUnitPriceUsd(commodity.id, dest.stock) -
      localUnitPriceUsd(commodity.id, origin.stock);
    const gap = Math.max(
      rawGap,
      commodity.basePricePerKg * (opts.minPayGapMult ?? 0),
    );
    const capacity = regionCapacity(origin.ap.region);
    const capacityPayMult = 1 + (1 - capacity) * THIN_FLEET_PAY_SLOPE;
    const scarcePayMult =
      laneSaturation >= LANE_BUSY_SATURATION
        ? 1 + laneSaturation * LANE_BUSY_PAY_SLOPE
        : 1;
    const weatherPayMult = regionalWeatherPayMult(laneWeather);
    const originLevelPay = hubLevelOriginPayMult(origin.ap.level ?? 1);
    const bushPay = bushLotPayMult(
      origin.ap.icao,
      dest.ap.icao,
      commodity.id,
    );
    const sizePayMult = size === 'xl' ? XL_LOT_PAY_MULT : 1;
    const payPerKg =
      Math.min(
        gap *
          0.55 *
          urgencyMult *
          distanceBias *
          capacityPayMult *
          scarcePayMult *
          weatherPayMult *
          corridorPayMult *
          shock.payMult *
          originLevelPay *
          bushPay,
        commodity.basePricePerKg *
          (international ? 2.1 : 1.8) *
          Math.max(1, bushPay * 0.95),
      ) * sizePayMult;
    const payUsd = Math.round(qty * payPerKg);
    // Lot life in 15-min ticks (legacy hour lives × 4).
    const baseLife = commodity.perishable
      ? 32 + Math.floor(rng() * 16)
      : 72 + Math.floor(rng() * 32);
    const life = Math.max(
      16,
      Math.round(
        baseLife *
          regionalWeatherLifeMult(laneWeather) *
          shock.lifeMult *
          (international ? INTERNATIONAL_LIFE_MULT : 1),
      ),
    );

    const shockNote =
      shock.labels.length > 0 ? ` · ${shock.labels.join('/')}` : '';
    const sizeNote =
      size === 'xl' ? ' · XL' : size === 'small' ? ' · LTL' : '';
    const lastMileNote = opts.lastMile === true ? ' · last-mile' : '';
    const lot: ShipmentLot = {
      id: `lot_${world.tick}_${commodity.id}_${origin.ap.icao}_${dest.ap.icao}_${Math.floor(rng() * 1e6)}`,
      commodityId: commodity.id,
      originIcao: origin.ap.icao,
      destIcao: dest.ap.icao,
      quantityKg: qty,
      reservedKg: 0,
      createdAtTick: world.tick,
      expiresAtTick: world.tick + life,
      payUsd,
      basePayUsd: payUsd,
      urgency: urgent ? 'urgent' : 'normal',
      reason: `${commodity.name}: surplus at ${origin.ap.icao} (fill ${(origin.fill * 100).toFixed(0)}%) → shortage at ${dest.ap.icao} (fill ${(dest.fill * 100).toFixed(0)}%)${sizeNote}${lastMileNote}${international ? ' · intl' : ''}${shockNote}`,
      status: 'available',
    };

    origin.stock.stockKg = clamp(
      origin.stock.stockKg - qty * LOT_FORMATION_RESERVE_FRACTION,
      0,
      origin.stock.capacityKg,
    );
    world.lots.push(lot);
    const odKey = undirectedOdKey(origin.ap.icao, dest.ap.icao);
    activeLaneKgByOd.set(odKey, (activeLaneKgByOd.get(odKey) ?? 0) + qty);
    recordLotFormationActivity(world, origin.ap.icao, dest.ap.icao);
    activeCounts.set(key, (activeCounts.get(key) ?? 0) + 1);
    noteAvailableLot(availableCounts, commodity.id, opts.partitionId, qty, 1);
    invalidateBoardPressure(commodity.id, opts.partitionId);
    noteLotFormed(world, commodity.id, qty, flowSizeBand(qty, size));
    if (size === 'xl') {
      xlCounts.set(key, (xlCounts.get(key) ?? 0) + 1);
    } else if (size === 'large') {
      largeCounts.set(key, (largeCounts.get(key) ?? 0) + 1);
    } else {
      smallCounts.set(key, (smallCounts.get(key) ?? 0) + 1);
    }
    bumpFormed(opts.partitionId);
    return true;
  };

  const tryFormPair = (
    commodity: (typeof CAREER_CARGO_COMMODITIES)[number],
    origin: RankedAirport,
    dest: RankedAirport,
    cw: number,
    opts: {
      international: boolean;
      partitionId: string;
      capacityKgPerDay?: number;
      allowSpokeFiller: boolean;
      originHasOpenCorridor: boolean;
    },
  ): void => {
    if (origin.ap.icao === dest.ap.icao) return;
    if (!isBushFreightOdAllowed(origin.ap.icao, dest.ap.icao)) return;
    if (!opts.international && !isDomesticOd(origin.ap.region, dest.ap.region)) {
      return;
    }
    if (cw <= 1) {
      if (!opts.allowSpokeFiller) return;
      const spokeFiller = origin.tier === 'spoke' && dest.tier === 'spoke';
      if (!spokeFiller) return;
      if (opts.originHasOpenCorridor || rng() > 0.2) return;
    }

    const boardPressure = boardPressureOf(commodity.id, opts.partitionId);
    // Soft-cap full: nothing left to form (after spoke rng, for stream parity).
    if (boardPressure.skipAll) return;

    // Cheap reject before saturation / inbound work.
    const priceGap = dest.price - origin.price;
    const minGapMult = opts.international ? 0.12 : cw >= 1.5 ? 0.15 : 0.22;
    if (priceGap < commodity.basePricePerKg * minGapMult) return;

    const key = laneKey(commodity.id, origin.ap.icao, dest.ap.icao);
    let caps = laneLotCaps(origin.tier, dest.tier, {
      originLevel: origin.ap.level,
      destLevel: dest.ap.level,
    });
    if (cw >= 1.8) {
      caps = {
        maxLots: caps.maxLots + 1,
        maxLarge: caps.maxLarge + 1,
        maxSmall: caps.maxSmall,
        maxXl: caps.maxXl,
      };
    }
    const laneSat = npcLaneSaturation(
      world,
      origin.ap.icao,
      dest.ap.icao,
      commodity.id,
    );
    if (laneSat >= 1) return;
    const satPenalty = laneSat >= 0.5 ? 1 : 0;
    if ((activeCounts.get(key) ?? 0) + satPenalty >= caps.maxLots) return;

    if (opts.capacityKgPerDay != null && opts.capacityKgPerDay > 0) {
      if (activeKgOnOd(origin.ap.icao, dest.ap.icao) >= opts.capacityKgPerDay) {
        return;
      }
    }

    const inboundKg = laneInboundKg(world, null, dest.ap.icao, commodity.id);
    const surplusKg = origin.stock.stockKg - origin.stock.capacityKg * 0.48;
    const roomKg = dest.stock.capacityKg * 0.58 - dest.stock.stockKg;
    let qty = Math.min(surplusKg, roomKg);
    qty = Math.floor(qty / 100) * 100;

    if (
      !boardPressure.skipHeavy &&
      qty >= XL_LOT_MIN_KG &&
      caps.maxXl > 0 &&
      (xlCounts.get(key) ?? 0) < caps.maxXl &&
      (activeCounts.get(key) ?? 0) + satPenalty < caps.maxLots &&
      xlLotOdEligible(origin.tier, dest.tier, cw, {
        international: opts.international,
        capacityKgPerDay: opts.capacityKgPerDay,
      })
    ) {
      const xlQty = Math.min(qty, XL_LOT_MAX_KG);
      const formedXl = pushLot(
        key,
        commodity,
        origin,
        dest,
        xlQty,
        'xl',
        laneSat,
        inboundKg,
        cw,
        opts,
      );
      if (formedXl) {
        const surplusAfter = origin.stock.stockKg - origin.stock.capacityKg * 0.48;
        const roomAfter = dest.stock.capacityKg * 0.58 - dest.stock.stockKg;
        qty = Math.floor(Math.min(surplusAfter, roomAfter) / 100) * 100;
      }
    }

    if (
      !boardPressure.skipHeavy &&
      qty >= 4_000 &&
      caps.maxLarge > 0 &&
      (largeCounts.get(key) ?? 0) < caps.maxLarge &&
      (activeCounts.get(key) ?? 0) + satPenalty < caps.maxLots
    ) {
      const largeQty = Math.min(qty, LARGE_LOT_MAX_KG);
      pushLot(
        key,
        commodity,
        origin,
        dest,
        largeQty,
        'large',
        laneSat,
        inboundKg,
        cw,
        opts,
      );
      const surplusAfter = origin.stock.stockKg - origin.stock.capacityKg * 0.48;
      const roomAfter = dest.stock.capacityKg * 0.58 - dest.stock.stockKg;
      qty = Math.floor(Math.min(surplusAfter, roomAfter) / 100) * 100;
    }

    // Small lots need a starter-class hop. Long-haul intl (GRU→MIA) is trunk.
    const nm = routeDistanceNm(world, origin.ap.icao, dest.ap.icao);
    const inSmallRange =
      nm != null && nm >= LAST_MILE_MIN_NM && nm <= SMALL_LOT_MAX_NM;
    const canFormGa = nm != null && nm <= GA_LTL_MAX_NM;
    const minSmallKg = canFormGa
      ? SMALL_LOT_MIN_KG
      : Math.max(FEEDER_LTL_MIN_KG, GA_LTL_MAX_KG + 50);
    if (
      !boardPressure.skipAll &&
      inSmallRange &&
      qty >= minSmallKg &&
      caps.maxSmall > 0 &&
      (smallCounts.get(key) ?? 0) < caps.maxSmall &&
      (activeCounts.get(key) ?? 0) + satPenalty < caps.maxLots
    ) {
      const sized = sizeSmallLotKg(qty, origin.tier, dest.tier, rng, nm);
      pushLot(
        key,
        commodity,
        origin,
        dest,
        sized,
        'small',
        laneSat,
        inboundKg,
        cw,
        opts,
      );
    }
  };

  const rankAirports = (
    airports: AirportTerminal[],
    commodity: (typeof CAREER_CARGO_COMMODITIES)[number],
  ): RankedAirport[] =>
    airports.map((ap) => {
      const stock = ensurePile(ap, commodity.id);
      const fill = fillPct(stock);
      return {
        ap,
        stock,
        fill,
        price: localUnitPriceUsd(commodity.id, stock),
        surplusKg: Math.max(0, stock.stockKg - stock.capacityKg * 0.48),
        roomKg: Math.max(0, stock.capacityKg * 0.58 - stock.stockKg),
        tier: hubTierOf(ap),
      };
    });

  // --- Domestic: one pass per country present in the world ---
  for (const countryId of listWorldCountryIds(world)) {
    const countryAirports = airportsByCountry.get(countryId) ?? [];
    for (const commodity of CAREER_CARGO_COMMODITIES) {
      const ranked = rankAirports(countryAirports, commodity);
      // Rank by fill pressure, not absolute kg. Absolute room/surplus is a proxy
      // for warehouse size, so the same high-capacity majors won every slot every
      // tick. Fill is what actually drives the price gap, and it rotates as lots
      // form and drain the hub.
      const destinations = ranked
        .filter((r) => r.fill <= 0.45 && r.roomKg >= 400)
        .sort((a, b) => a.fill - b.fill)
        .slice(0, 12);
      const origins = ranked
        .filter((r) => r.fill >= 0.55 && r.surplusKg >= 400)
        .sort((a, b) => b.fill - a.fill)
        .slice(0, 12);

      const byIcao = new Map(ranked.map((r) => [r.ap.icao, r]));
      const mergeUnique = (
        list: RankedAirport[],
        candidate: RankedAirport | undefined,
      ) => {
        if (!candidate) return;
        if (list.some((r) => r.ap.icao === candidate.ap.icao)) return;
        list.push(candidate);
      };
      // Absolute-kg ranking favors majors. Keep critically full regionals and
      // spokes eligible for the overflow valve even when they miss the top 12.
      for (const row of ranked) {
        if (
          row.tier !== 'major' &&
          row.fill >= DOMESTIC_OVERFLOW_ORIGIN_FILL &&
          row.surplusKg >= 400
        ) {
          mergeUnique(origins, row);
        }
      }
      for (const origin of [...origins]) {
        for (const partner of corridorPartners(origin.ap.icao)) {
          const row = byIcao.get(partner);
          if (row && row.fill <= 0.45 && row.roomKg >= 400) {
            mergeUnique(destinations, row);
          }
        }
      }
      for (const dest of [...destinations]) {
        for (const partner of corridorPartners(dest.ap.icao)) {
          const row = byIcao.get(partner);
          if (row && row.fill >= 0.55 && row.surplusKg >= 400) {
            mergeUnique(origins, row);
          }
        }
      }

      const laneOpen = (o: RankedAirport, d: RankedAirport, weight: number): boolean => {
        let caps = laneLotCaps(o.tier, d.tier, {
          originLevel: o.ap.level,
          destLevel: d.ap.level,
        });
        if (weight >= 1.8) {
          caps = {
            maxLots: caps.maxLots + 1,
            maxLarge: caps.maxLarge + 1,
            maxSmall: caps.maxSmall,
            maxXl: caps.maxXl,
          };
        }
        const key = laneKey(commodity.id, o.ap.icao, d.ap.icao);
        const laneSat = npcLaneSaturation(world, o.ap.icao, d.ap.icao, commodity.id);
        if (laneSat >= 1) return false;
        const satPenalty = laneSat >= 0.5 ? 1 : 0;
        return (activeCounts.get(key) ?? 0) + satPenalty < caps.maxLots;
      };

      const originHasOpenCorridor = (o: RankedAirport): boolean => {
        for (const partnerIcao of corridorPartners(o.ap.icao)) {
          const partner = byIcao.get(partnerIcao);
          if (!partner || partner.fill > 0.45 || partner.roomKg < 400) continue;
          if (countryIdFromRegion(partner.ap.region) !== countryId) continue;
          const w = corridorWeight(o.ap.icao, partner.ap.icao);
          if (laneOpen(o, partner, w)) return true;
        }
        return false;
      };

      for (const origin of origins) {
        const hasOpenCorridor = originHasOpenCorridor(origin);
        const orderedDests = [...destinations].sort((a, b) => {
          const wa = corridorWeight(origin.ap.icao, a.ap.icao);
          const wb = corridorWeight(origin.ap.icao, b.ap.icao);
          return wb - wa;
        });
        for (const dest of orderedDests) {
          tryFormPair(commodity, origin, dest, corridorWeight(origin.ap.icao, dest.ap.icao), {
            international: false,
            partitionId: countryId,
            allowSpokeFiller: true,
            originHasOpenCorridor: hasOpenCorridor,
          });
        }

        // If a non-major warehouse remains critically full and every curated
        // gateway is blocked, release at most one low-priority domestic OD per
        // commodity/tick. It still requires a deep shortage, price gap, range,
        // and normal lane caps; curated corridors continue to win first.
        if (
          origin.tier !== 'major' &&
          origin.fill >= DOMESTIC_OVERFLOW_ORIGIN_FILL &&
          !hasOpenCorridor
        ) {
          const overflowDest = destinations.find(
            (dest) =>
              dest.ap.icao !== origin.ap.icao &&
              dest.fill <= DOMESTIC_OVERFLOW_DEST_FILL &&
              corridorWeight(origin.ap.icao, dest.ap.icao) === 1 &&
              laneOpen(origin, dest, DOMESTIC_OVERFLOW_CORRIDOR_WEIGHT),
          );
          if (overflowDest) {
            tryFormPair(
              commodity,
              origin,
              overflowDest,
              DOMESTIC_OVERFLOW_CORRIDOR_WEIGHT,
              {
                international: false,
                partitionId: countryId,
                allowSpokeFiller: false,
                originHasOpenCorridor: false,
              },
            );
          }
        }
      }
    }
  }

  const openGaDryByOrigin = new Map<string, number>();
  for (const lot of world.lots) {
    if (lot.status !== 'available' && lot.status !== 'reserved') continue;
    if (lot.quantityKg > GA_LTL_MAX_KG) continue;
    if (!LAST_MILE_DRY_IDS.has(lot.commodityId)) continue;
    const key = `${lot.originIcao.toUpperCase()}|${lot.commodityId}`;
    openGaDryByOrigin.set(key, (openGaDryByOrigin.get(key) ?? 0) + 1);
  }
  const countOpenGaDryFrom = (
    originIcao: string,
    commodityId: CommodityId,
  ): number => {
    return openGaDryByOrigin.get(`${originIcao.toUpperCase()}|${commodityId}`) ?? 0;
  };

  // Last-mile Dry: metros stay net sinks in the bulk pass, but still break
  // bulk to nearby spokes so a starter at GRU/JFK has a GA Dry contract.
  for (const countryId of listWorldCountryIds(world)) {
    const countryAirports = airportsByCountry.get(countryId) ?? [];
    for (const commodity of CAREER_CARGO_COMMODITIES) {
      if (!LAST_MILE_DRY_IDS.has(commodity.id)) continue;
      const ranked = rankAirports(countryAirports, commodity);
      for (const origin of ranked) {
        if (!LAST_MILE_ORIGIN_TIERS.has(origin.tier)) continue;
        // Surplus majors already export in the bulk pass, but that pass prefers
        // large lots — keep a GA Dry floor either way so a starter at JFK/LAX
        // is not staring at 18 t electronics. Spoke home hubs may be Dry sinks;
        // still form a short hop if any stock remains.
        if (
          origin.tier !== 'spoke' &&
          origin.fill < LAST_MILE_MIN_ORIGIN_FILL
        ) {
          continue;
        }
        if (origin.stock.stockKg < SMALL_LOT_MIN_KG) continue;
        let open = countOpenGaDryFrom(origin.ap.icao, commodity.id);
        if (open >= LAST_MILE_OPEN_LOTS_PER_ORIGIN) continue;

        const dests: Array<{
          row: RankedAirport;
          nm: number;
          cw: number;
        }> = [];
        for (const dest of ranked) {
          if (dest.ap.icao === origin.ap.icao) continue;
          // Majors break-bulk to spokes/regionals, not to other majors.
          // Spokes may still feed a nearby major (the home-hub short hop).
          if (origin.tier === 'major' && dest.tier === 'major') continue;
          if (dest.fill > LAST_MILE_MAX_DEST_FILL) continue;
          if (dest.roomKg < SMALL_LOT_MIN_KG) continue;
          if (!isBushFreightOdAllowed(origin.ap.icao, dest.ap.icao)) continue;
          const nm = routeDistanceNm(world, origin.ap.icao, dest.ap.icao);
          if (
            nm == null ||
            nm < LAST_MILE_MIN_NM ||
            nm > LAST_MILE_MAX_NM
          ) {
            continue;
          }
          dests.push({
            row: dest,
            nm,
            cw: corridorWeight(origin.ap.icao, dest.ap.icao),
          });
        }
        dests.sort((a, b) => (b.cw !== a.cw ? b.cw - a.cw : a.nm - b.nm));

        let formedThisTick = 0;
        for (const { row: dest } of dests) {
          if (open >= LAST_MILE_OPEN_LOTS_PER_ORIGIN) break;
          if (formedThisTick >= LAST_MILE_MAX_FORM_PER_TICK) break;
          const key = laneKey(commodity.id, origin.ap.icao, dest.ap.icao);
          const caps = laneLotCaps(origin.tier, dest.tier, {
            originLevel: origin.ap.level,
            destLevel: dest.ap.level,
          });
          const laneSat = npcLaneSaturation(
            world,
            origin.ap.icao,
            dest.ap.icao,
            commodity.id,
          );
          if (laneSat >= 1) continue;
          const satPenalty = laneSat >= 0.5 ? 1 : 0;
          if ((activeCounts.get(key) ?? 0) + satPenalty >= caps.maxLots) {
            continue;
          }
          if ((smallCounts.get(key) ?? 0) >= caps.maxSmall) continue;

          if (boardPressureOf(commodity.id, countryId).skipAll) break;

          const take = Math.min(
            origin.stock.stockKg * (origin.tier === 'spoke' ? 0.5 : 0.08),
            dest.roomKg,
            GA_LTL_MAX_KG,
          );
          const qty = Math.floor(take / 10) * 10;
          if (qty < SMALL_LOT_MIN_KG) continue;

          const inboundKg = laneInboundKg(
            world,
            null,
            dest.ap.icao,
            commodity.id,
          );
          const formed = pushLot(
            key,
            commodity,
            origin,
            dest,
            qty,
            'small',
            laneSat,
            inboundKg,
            Math.max(corridorWeight(origin.ap.icao, dest.ap.icao), 1.15),
            {
              international: false,
              partitionId: countryId,
              minPayGapMult: 0.2,
              lastMile: true,
            },
          );
          if (formed) {
            open += 1;
            formedThisTick += 1;
          }
        }
      }
    }
  }

  // --- International: only curated sparse lanes (both directions) ---
  const byIcaoAll = new Map(world.airports.map((ap) => [ap.icao.toUpperCase(), ap]));
  const intlEndpointIcaos = new Set<string>();
  for (const lane of world.internationalLanes ?? []) {
    intlEndpointIcaos.add(lane.originIcao.trim().toUpperCase());
    intlEndpointIcaos.add(lane.destIcao.trim().toUpperCase());
  }
  const intlAirports = world.airports.filter((ap) =>
    intlEndpointIcaos.has(ap.icao.toUpperCase()),
  );
  for (const commodity of CAREER_CARGO_COMMODITIES) {
    const rankedAll = rankAirports(intlAirports, commodity);
    const rankedByIcao = new Map(rankedAll.map((r) => [r.ap.icao.toUpperCase(), r]));
    for (const lane of world.internationalLanes ?? []) {
      const pairs: Array<[string, string]> = [
        [lane.originIcao, lane.destIcao],
        [lane.destIcao, lane.originIcao],
      ];
      for (const [oIcao, dIcao] of pairs) {
        if (!byIcaoAll.has(oIcao.toUpperCase()) || !byIcaoAll.has(dIcao.toUpperCase())) {
          continue;
        }
        const origin = rankedByIcao.get(oIcao.toUpperCase());
        const dest = rankedByIcao.get(dIcao.toUpperCase());
        if (!origin || !dest) continue;
        if (origin.fill < 0.55 || origin.surplusKg < 400) continue;
        if (dest.fill > 0.45 || dest.roomKg < 400) continue;
        const cw = Math.max(
          corridorWeight(origin.ap.icao, dest.ap.icao),
          INTERNATIONAL_CORRIDOR_WEIGHT,
        );
        tryFormPair(commodity, origin, dest, cw, {
          international: true,
          partitionId: INTL_BOARD_PARTITION,
          capacityKgPerDay: lane.capacityKgPerDay,
          allowSpokeFiller: false,
          originHasOpenCorridor: false,
        });
      }
    }
  }

  const results: PartitionTickResult[] = [];
  for (const countryId of listWorldCountryIds(world)) {
    results.push({
      countryId,
      ticksAdvanced: 1,
      lotsFormed: formedByPartition.get(countryId) ?? 0,
      npcSettled: 0,
    });
  }
  results.push({
    countryId: 'INTL',
    ticksAdvanced: 1,
    lotsFormed: formedByPartition.get('INTL') ?? 0,
    npcSettled: 0,
  });
  return results;
}

/** Optional per-phase ms accumulator for tick profiling (bench / CLI). */
export type TickPhaseId =
  | 'ensure'
  | 'settle'
  | 'production'
  | 'fuel'
  | 'expire'
  | 'escalate'
  | 'events'
  | 'formLots'
  | 'npc'
  | 'hubLevels'
  | 'total';

export type TickPhaseProfile = {
  ticks: number;
  ms: Record<TickPhaseId, number>;
};

export function createEmptyTickPhaseProfile(): TickPhaseProfile {
  return {
    ticks: 0,
    ms: {
      ensure: 0,
      settle: 0,
      production: 0,
      fuel: 0,
      expire: 0,
      escalate: 0,
      events: 0,
      formLots: 0,
      npc: 0,
      hubLevels: 0,
      total: 0,
    },
  };
}

function addTickPhaseMs(
  profile: TickPhaseProfile | undefined,
  phase: TickPhaseId,
  startedAt: number,
): void {
  if (!profile) return;
  profile.ms[phase] += performance.now() - startedAt;
}

/** Advance the local economy by one hourly batch. Mutates and returns the world. */
export function tickEconomy(
  world: CareerEconomyWorld,
  opts: {
    rngSeed?: string;
    batchNowMs?: number;
    /** When set, accumulates wall ms per phase (does not change sim behavior). */
    profile?: TickPhaseProfile;
  } = {},
): CareerEconomyWorld {
  const profile = opts.profile;
  const tickStartedAt = performance.now();
  let phaseAt = tickStartedAt;

  if (
    (world as { version?: number }).version !== 3 ||
    !Array.isArray(world.events) ||
    !Array.isArray(world.npcs) ||
    typeof world.lastBatchAtMs !== 'number'
  ) {
    const migrated = migrateEconomyWorld(world);
    world.version = 3;
    world.lastBatchAtMs = migrated.lastBatchAtMs;
    world.lastSyncedAtMs = migrated.lastBatchAtMs;
    world.events = migrated.events;
    world.airports = migrated.airports;
    world.lots = migrated.lots;
    world.npcs = migrated.npcs;
    world.npcFlights = migrated.npcFlights;
    world.fuelTrucks = migrated.fuelTrucks;
    world.fuelHauls = migrated.fuelHauls;
    world.homeCountryId = migrated.homeCountryId;
    world.internationalLanes = migrated.internationalLanes;
    if (migrated.portListings) {
      world.portListings = migrated.portListings;
    }
    if (migrated.portInventories) {
      world.portInventories = migrated.portInventories;
    }
    if (migrated.portConcessions) {
      world.portConcessions = migrated.portConcessions;
    }
    if (migrated.demandOrders) {
      world.demandOrders = migrated.demandOrders;
    }
  }

  ensureNpcFleet(world);
  ensureFuelTruckFleet(world);
  ensureWorldHubLevels(world);
  ensureInternationalLanes(world);
  ensureHomeCountryId(world);
  addTickPhaseMs(profile, 'ensure', phaseAt);
  phaseAt = performance.now();

  const batchNowMs =
    opts.batchNowMs ??
    (world.lastBatchAtMs ?? Date.now()) + MS_PER_TICK;
  // Land due flights/hauls before production + lot formation so capacity and
  // bid pressure see the post-arrival board (also avoids a second settle in NPC tick).
  settleNpcOpsDue(world, batchNowMs);
  settleFuelHaulsDue(world, batchNowMs);
  addTickPhaseMs(profile, 'settle', phaseAt);
  phaseAt = performance.now();

  world.tick += 1;
  const rng = mulberry32(hashSeed(`${opts.rngSeed ?? world.seed}:t${world.tick}`));

  applyProductionConsumption(world, rng);
  addTickPhaseMs(profile, 'production', phaseAt);
  phaseAt = performance.now();

  tickFuelLogistics(world, rng, { batchNowMs });
  addTickPhaseMs(profile, 'fuel', phaseAt);
  phaseAt = performance.now();

  expireLots(world);
  addTickPhaseMs(profile, 'expire', phaseAt);
  phaseAt = performance.now();

  escalateIdleLots(world);
  addTickPhaseMs(profile, 'escalate', phaseAt);
  phaseAt = performance.now();

  maybeSpawnEvents(world, rng);
  addTickPhaseMs(profile, 'events', phaseAt);
  phaseAt = performance.now();

  formLotsFromImbalances(world, rng);
  addTickPhaseMs(profile, 'formLots', phaseAt);
  phaseAt = performance.now();

  tickNpcFreighters(world, rng, { batchNowMs });
  addTickPhaseMs(profile, 'npc', phaseAt);
  phaseAt = performance.now();

  tickHubLevels(world);
  addTickPhaseMs(profile, 'hubLevels', phaseAt);

  if (profile) {
    profile.ticks += 1;
    profile.ms.total += performance.now() - tickStartedAt;
  }

  return world;
}

/**
 * Shift absolute wall-clock stamps (batch anchor, NPC flights, busy/rest).
 * Used so instant +N hour advances age in-progress ops instead of freezing them.
 */
export function shiftEconomyWallClock(
  world: CareerEconomyWorld,
  deltaMs: number,
): void {
  if (!Number.isFinite(deltaMs) || deltaMs === 0) return;
  if (typeof world.lastBatchAtMs === 'number' && Number.isFinite(world.lastBatchAtMs)) {
    world.lastBatchAtMs += deltaMs;
  }
  if (typeof world.lastSyncedAtMs === 'number' && Number.isFinite(world.lastSyncedAtMs)) {
    world.lastSyncedAtMs += deltaMs;
  }
  for (const flight of world.npcFlights ?? []) {
    if (typeof flight.departedAtMs === 'number' && Number.isFinite(flight.departedAtMs)) {
      flight.departedAtMs += deltaMs;
    }
    if (typeof flight.arrivesAtMs === 'number' && Number.isFinite(flight.arrivesAtMs)) {
      flight.arrivesAtMs += deltaMs;
    }
    if (
      typeof flight.awaitingPilotUntilMs === 'number' &&
      Number.isFinite(flight.awaitingPilotUntilMs)
    ) {
      flight.awaitingPilotUntilMs += deltaMs;
    }
  }
  for (const npc of world.npcs ?? []) {
    if (typeof npc.busyUntilMs === 'number' && Number.isFinite(npc.busyUntilMs)) {
      npc.busyUntilMs += deltaMs;
    }
    if (typeof npc.restUntilMs === 'number' && Number.isFinite(npc.restUntilMs)) {
      npc.restUntilMs += deltaMs;
    }
  }
  shiftFuelLogisticsWallClock(world, deltaMs);
}

/**
 * Advance n 15-minute batches. When advanceWallClock is true (default for UI +1 day /
 * catch-up), shifts lastBatchAtMs and uses coherent batch wall times for NPC claims.
 *
 * Instant +N (no fromBatchAtMs) rewinds wall timestamps so the previous lastBatch
 * maps to (now − N batches), then resimulates forward to now. Without that rewind,
 * rapid +1 day clicks only bump the tick counter while NPC ETAs stay glued to
 * Date.now() and the competing fleet board looks frozen.
 */
export function tickEconomyN(
  world: CareerEconomyWorld,
  n: number,
  opts: {
    advanceWallClock?: boolean;
    fromBatchAtMs?: number;
    profile?: TickPhaseProfile;
  } = {},
): CareerEconomyWorld {
  const steps = Math.max(0, Math.floor(n));
  const advanceWall = opts.advanceWallClock !== false;
  const explicitStart =
    typeof opts.fromBatchAtMs === 'number' && Number.isFinite(opts.fromBatchAtMs)
      ? opts.fromBatchAtMs
      : undefined;

  let startBatch: number;
  if (explicitStart !== undefined) {
    startBatch = explicitStart;
  } else if (advanceWall && steps > 0) {
    const endBatch = Date.now();
    startBatch = endBatch - steps * MS_PER_TICK;
    const prev = world.lastBatchAtMs ?? endBatch;
    shiftEconomyWallClock(world, startBatch - prev);
  } else {
    startBatch = Date.now() - steps * MS_PER_TICK;
  }

  for (let i = 0; i < steps; i++) {
    const batchNowMs = startBatch + (i + 1) * MS_PER_TICK;
    tickEconomy(world, { batchNowMs, profile: opts.profile });
  }

  if (advanceWall && steps > 0) {
    world.lastBatchAtMs = startBatch + steps * MS_PER_TICK;
    world.lastSyncedAtMs = world.lastBatchAtMs;
  }
  // Catch-up often lands many turnarounds on the same hour — spread them for the board.
  ensureNpcFleet(world);
  ensureFuelTruckFleet(world);
  return world;
}

export type EconomyTickBenchReport = {
  seed: string;
  airports: number;
  countries: number;
  regions: number;
  npcs: number;
  fuelTrucks: number;
  /** After warm day (or 0 if warm skipped). */
  warmTick: number;
  availableLotsAfterWarm: number;
  /** Profiled single tick after warm. */
  oneTick: TickPhaseProfile;
  /** Profiled +1 day (96 ticks) after the one-tick sample. */
  oneDay: TickPhaseProfile;
  availableLotsAfterDay: number;
  npcFlightsInFlightAfterDay: number;
};

/**
 * In-memory timing harness: warm one day (unprofiled), then profile 1 tick + 96 ticks.
 * Does not change economy rules — only measures wall time.
 */
export function benchEconomyTicks(opts: {
  seed?: string;
  /** Skip the unprofiled warm day (measures cold first day instead for oneDay). */
  skipWarm?: boolean;
} = {}): EconomyTickBenchReport {
  const world = createSeedEconomyWorld({ seed: opts.seed });
  const regions = listNpcHomeRegions(world.airports);

  if (!opts.skipWarm) {
    ensureSeedMarketFormed(world);
  }

  const warmTick = world.tick;
  const availableLotsAfterWarm = world.lots.filter(
    (l) => l.status === 'available' && l.quantityKg > l.reservedKg,
  ).length;

  const oneTick = createEmptyTickPhaseProfile();
  tickEconomyN(world, 1, { advanceWallClock: false, profile: oneTick });

  const oneDay = createEmptyTickPhaseProfile();
  tickEconomyN(world, TICKS_PER_DAY, {
    advanceWallClock: false,
    profile: oneDay,
  });

  return {
    seed: world.seed,
    airports: world.airports.length,
    countries: listWorldCountryIds(world).length,
    regions: regions.length,
    npcs: world.npcs?.length ?? 0,
    fuelTrucks: world.fuelTrucks?.length ?? 0,
    warmTick,
    availableLotsAfterWarm,
    oneTick,
    oneDay,
    availableLotsAfterDay: world.lots.filter(
      (l) => l.status === 'available' && l.quantityKg > l.reservedKg,
    ).length,
    npcFlightsInFlightAfterDay: (world.npcFlights ?? []).filter(
      (f) => f.status === 'in_flight',
    ).length,
  };
}

/**
 * Fresh seeds start at tick 0 with an empty board. Warm one career day so
 * Freights/Contracts exist on first boot and after reset without a manual +1 day.
 * No-op when the world already has time or available lots.
 */
export function ensureSeedMarketFormed(world: CareerEconomyWorld): boolean {
  const hasAvailable = world.lots.some(
    (lot) => lot.status === 'available' && lot.quantityKg > lot.reservedKg,
  );
  if (world.tick > 0 || hasAvailable) return false;
  tickEconomyN(world, TICKS_PER_DAY);
  return true;
}

/** Split a free-text route search ("SBAR", "SBAR SBGR", "SBAR→SBGR") into tokens. */
export function marketQueryTokens(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/[\s,/>\-→]+/)
    .filter(Boolean);
}

/** Every token must appear in a single ICAO/city endpoint blob. */
export function marketEndpointMatchesQuery(
  tokens: string[],
  icao: string,
  name?: string,
): boolean {
  if (tokens.length === 0) return true;
  const blob = `${icao} ${name ?? ''}`.toLowerCase();
  return tokens.every((token) => blob.includes(token));
}

/** Every token must appear in the ICAO/city blob, matching the market board input. */
export function marketLotMatchesQuery(
  tokens: string[],
  fields: {
    originIcao: string;
    destIcao: string;
    originName?: string;
    destName?: string;
  },
): boolean {
  if (tokens.length === 0) return true;
  const blob =
    `${fields.originIcao} ${fields.destIcao} ${fields.originName ?? ''} ${fields.destName ?? ''}`.toLowerCase();
  return tokens.every((token) => blob.includes(token));
}

export function listMarketLots(
  world: CareerEconomyWorld,
  opts: {
    originIcao?: string;
    destIcao?: string;
    commodityId?: CommodityId;
    /** Free-text ICAO/city search applied to the whole route (legacy combined). */
    query?: string;
    /** Free-text ICAO/city search applied only to origin. */
    originQuery?: string;
    /** Free-text ICAO/city search applied only to destination. */
    destQuery?: string;
    nowMs?: number;
  } = {},
): MarketLotView[] {
  const byIcao = airportMap(world);
  const views: MarketLotView[] = [];
  const nowMs = opts.nowMs ?? Date.now();
  const queryTokens = marketQueryTokens(opts.query ?? '');
  const originQueryTokens = marketQueryTokens(opts.originQuery ?? '');
  const destQueryTokens = marketQueryTokens(opts.destQuery ?? '');

  for (const lot of world.lots) {
    if (lot.status !== 'available' && lot.status !== 'reserved') {
      continue;
    }
    const claim = npcClaimForLot(world, lot.id, nowMs);
    const avail = availableKg(lot);
    // Fully reserved crew-needed offers stay visible until accepted or timeout.
    if (avail <= 0 && !claim?.crewNeeded) {
      continue;
    }
    if (opts.originIcao && lot.originIcao !== opts.originIcao.toUpperCase()) {
      continue;
    }
    if (opts.destIcao && lot.destIcao !== opts.destIcao.toUpperCase()) {
      continue;
    }
    if (opts.commodityId && lot.commodityId !== opts.commodityId) {
      continue;
    }

    const origin = byIcao.get(lot.originIcao);
    const dest = byIcao.get(lot.destIcao);
    const originName = origin?.name ?? lot.originIcao;
    const destName = dest?.name ?? lot.destIcao;
    if (
      !marketLotMatchesQuery(queryTokens, {
        originIcao: lot.originIcao,
        destIcao: lot.destIcao,
        originName,
        destName,
      })
    ) {
      continue;
    }
    if (
      !marketEndpointMatchesQuery(originQueryTokens, lot.originIcao, originName)
    ) {
      continue;
    }
    if (!marketEndpointMatchesQuery(destQueryTokens, lot.destIcao, destName)) {
      continue;
    }
    const oStock = origin ? ensurePile(origin, lot.commodityId) : pile(0, 1);
    const dStock = dest ? ensurePile(dest, lot.commodityId) : pile(0, 1);
    const commodity = getCommodity(lot.commodityId);
    const pressure = describeLotMarketPressure(world, lot, nowMs);
    const idlePayMult = idleLotPayMult(lot, world.tick);
    pressure.idlePayMult = idlePayMult;
    pressure.idleEscalated = idlePayMult > 1.02;
    const originRegion =
      byIcao.get(lot.originIcao)?.region ?? pressure.originRegion;
    const destRegion = byIcao.get(lot.destIcao)?.region ?? '';
    const shock = laneDemandShock(world, {
      originRegion,
      destRegion,
      commodityId: lot.commodityId,
    });
    pressure.demandShock = shock.labels.length > 0;
    pressure.shockLabels = shock.labels;
    pressure.shockPayMult = shock.payMult;
    pressure.international = !isDomesticOd(originRegion, destRegion);

    views.push({
      lot,
      originName,
      destName,
      commodityName: commodity.name,
      availableKg: avail,
      payPerKgUsd: lot.payUsd / lot.quantityKg,
      originStockKg: oStock.stockKg,
      destStockKg: dStock.stockKg,
      originFillPct: fillPct(oStock),
      destFillPct: fillPct(dStock),
      npcClaim: claim
        ? {
            npcId: claim.npcId,
            npcName: claim.npcName,
            cargoKg: claim.cargoKg,
            etaHours: claim.etaHours,
            ...(claim.crewNeeded
              ? {
                  crewNeeded: true,
                  ...(claim.crewReposition ? { crewReposition: true } : {}),
                  pilotFeeUsd: claim.pilotFeeUsd,
                  ...(typeof claim.pilotFeeMinUsd === 'number'
                    ? { pilotFeeMinUsd: claim.pilotFeeMinUsd }
                    : {}),
                  awaitingPilotUntilMs: claim.awaitingPilotUntilMs,
                }
              : {}),
            ...(claim.airframeTypeId
              ? { airframeTypeId: claim.airframeTypeId }
              : {}),
            ...(claim.aircraftLabel
              ? { aircraftLabel: claim.aircraftLabel }
              : {}),
            ...(claim.aircraftClassId
              ? { aircraftClassId: claim.aircraftClassId }
              : {}),
          }
        : undefined,
      pressure,
    });
  }

  views.sort((a, b) => {
    const aCrew = a.npcClaim?.crewNeeded ? 1 : 0;
    const bCrew = b.npcClaim?.crewNeeded ? 1 : 0;
    if (aCrew !== bCrew) return bCrew - aCrew;
    const aPay = boardDisplayPayUsd({
      lotPayUsd: a.lot.payUsd,
      quantityKg: a.lot.quantityKg,
      crewNeeded: a.npcClaim?.crewNeeded,
      claimCargoKg: a.npcClaim?.cargoKg,
      pilotFeeUsd: a.npcClaim?.pilotFeeUsd,
    });
    const bPay = boardDisplayPayUsd({
      lotPayUsd: b.lot.payUsd,
      quantityKg: b.lot.quantityKg,
      crewNeeded: b.npcClaim?.crewNeeded,
      claimCargoKg: b.npcClaim?.cargoKg,
      pilotFeeUsd: b.npcClaim?.pilotFeeUsd,
    });
    return bPay - aPay;
  });
  return views;
}

/** Active NPC hauls for UI boards. */
export function listActiveNpcFreights(
  world: CareerEconomyWorld,
  nowMs = Date.now(),
): NpcActivityView[] {
  return listNpcActivity(world, nowMs);
}

/** Clone world for immutable-style tests / saves. */
export function cloneEconomyWorld(world: CareerEconomyWorld): CareerEconomyWorld {
  return structuredClone(world);
}
